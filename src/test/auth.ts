import { graphql } from 'msw/graphql';
import { config } from '../config-env';
import { SESSION_STORAGE_KEY, type Session, type SessionStaff } from '../graphql/session';
import { mockAccessToken, setRefreshCookie } from '../mocks/staff';

export const ADMIN: SessionStaff = {
  id: 'staff-admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  permissions: ['bo', 'bo:staff', 'bo:staff:modify', 'bo:settings', 'bo:settings:modify'],
};
export const SUPPORT: SessionStaff = {
  id: 'staff-support',
  email: 'support@example.com',
  role: 'SUPPORT',
  permissions: ['bo'],
};

/** A session of a mock staff member; `expired` = its access token has already expired. */
export function testSession(staff = ADMIN, { expired = false } = {}): Session {
  const expiresAt = expired ? Date.now() - 1000 : Date.now() + 15 * 60 * 1000;
  return {
    accessToken: mockAccessToken(staff.id, expiresAt),
    accessTokenExpiresAt: new Date(expiresAt).toISOString(),
    staff,
  };
}

/**
 * Starts as an already signed-in staff member (written straight to storage, as a reload finds it).
 * `refreshable: false`: no refresh cookie, so a refresh fails with INVALID_REFRESH_TOKEN.
 */
export function signInForTest({ staff = ADMIN, expired = false, refreshable = true } = {}): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(testSession(staff, { expired })));
  if (refreshable) setRefreshCookie(staff.id);
}

/** What another tab does: it writes the storage, and this tab gets a `storage` event. */
export function otherTabWrites(session: Session | null): void {
  if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_STORAGE_KEY);
  window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
}

export const walletCore = graphql.link(config.walletCoreUrl);

/**
 * Counts calls of an operation and lets the default mock answer (a resolver that returns nothing falls through).
 * `wait` holds the call until it resolves.
 */
export function countCalls(operation: string, wait?: () => Promise<void>) {
  const counter = { calls: 0 };
  const handler = walletCore.operation(async ({ operationName }) => {
    if (operationName !== operation) return;
    counter.calls += 1;
    await wait?.();
  });
  return { counter, handler };
}
