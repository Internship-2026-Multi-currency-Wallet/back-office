import type { StaffRole } from '../gql/wallet-core/graphql';

/**
 * The staff session, kept in localStorage (same MVP decision as client-web). The refresh token is the HttpOnly
 * `staff_refresh_token` cookie that only the browser and wallet-core see.
 */

/** As `StaffMe` from wallet-core: the permissions come from the backend, never computed here. */
export interface SessionStaff {
  id: string;
  email: string;
  role: StaffRole;
  permissions: string[];
}

export interface Session {
  /** One logical session: a login creates a new one, a refresh keeps it. */
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  staff: SessionStaff;
}

export const SESSION_STORAGE_KEY = 'wallet.staff.session';

/** An access token this close to its expiry counts as expired (clock skew, request time). */
export const EXPIRY_SKEW_MS = 30_000;

type Listener = (session: Session | null) => void;
const listeners = new Set<Listener>();

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** Stored data is never trusted: anything malformed counts as "signed out". */
function parseSession(raw: string | null): Session | null {
  try {
    const { sessionId, accessToken, accessTokenExpiresAt, staff } = JSON.parse(
      raw ?? 'null',
    ) as Record<string, unknown>;
    const { id, email, role, permissions } = (staff ?? {}) as Record<string, unknown>;
    if (!nonEmpty(sessionId) || !nonEmpty(accessToken) || !nonEmpty(accessTokenExpiresAt))
      return null;
    if (!Number.isFinite(Date.parse(accessTokenExpiresAt))) return null;
    if (!nonEmpty(id) || !nonEmpty(email) || !nonEmpty(role)) return null;
    if (!Array.isArray(permissions) || !permissions.every(nonEmpty)) return null;
    return {
      sessionId,
      accessToken,
      accessTokenExpiresAt,
      staff: { id, email, role: role as StaffRole, permissions },
    };
  } catch {
    return null;
  }
}

/**
 * `staffLogin` / `staffRefreshSession` result → session (only the fields we keep). A login gets a new `sessionId`;
 * a refresh passes the current one. Not a secret: it only tells two sessions apart.
 */
export function sessionFromPayload(
  payload: Omit<Session, 'sessionId'>,
  sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
): Session {
  const { accessToken, accessTokenExpiresAt, staff } = payload;
  const { id, email, role, permissions } = staff;
  return { sessionId, accessToken, accessTokenExpiresAt, staff: { id, email, role, permissions } };
}

export function loadSession(): Session | null {
  return parseSession(localStorage.getItem(SESSION_STORAGE_KEY));
}

export function accessToken(): string | null {
  return loadSession()?.accessToken ?? null;
}

export function isAccessTokenExpired(session: Session, now = Date.now()): boolean {
  return Date.parse(session.accessTokenExpiresAt) - now <= EXPIRY_SKEW_MS;
}

function notify(session: Session | null): void {
  for (const listener of [...listeners]) listener(session);
}

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  notify(session);
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  notify(null);
}

/** Also called for changes made in another tab. */
export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The `storage` event fires only in the OTHER tabs.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_STORAGE_KEY || event.key === null) notify(loadSession());
  });
}

// One lock for login, refresh and logout: each of them replaces or revokes the refresh cookie that all tabs share,
// so they run one at a time. Plain requests never take it.
const SESSION_LOCK = 'wallet.staff.session';

export function withSessionLock<T>(callback: () => Promise<T>): Promise<T> {
  // No Web Locks outside a secure context (e.g. the dev server opened via a LAN IP): not coordinated.
  return navigator.locks ? navigator.locks.request(SESSION_LOCK, callback) : callback();
}
