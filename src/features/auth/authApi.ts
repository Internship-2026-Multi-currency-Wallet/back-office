import type { StaffLoginInput } from '../../gql/wallet-core/graphql';
import { request, type RequestOptions, SESSION_TIMEOUT_MS } from '../../graphql/client';
import {
  saveSession,
  type SessionStaff,
  sessionFromPayload,
  withSessionLock,
} from '../../graphql/session';
import { staffLoginMutation, staffLogoutMutation } from './auth.wallet-core';

// Plain functions, not RTK Query mutations: a login or logout changes the identity, the store then dispatches
// `resetApiState`, and that aborts every running mutation, so a mutation would report `AbortError` after success.

/**
 * These calls create or end the session: an `UNAUTHENTICATED` is their answer, never a reason to refresh. They hold
 * the session lock, so a hung request is cancelled after `SESSION_TIMEOUT_MS` (a new signal for every call).
 */
const sessionCall = (): RequestOptions => ({
  retryOnUnauthenticated: false,
  signal: AbortSignal.timeout(SESSION_TIMEOUT_MS),
});

/** Logs in and stores the session. Under the session lock until the cookie and the stored session agree. */
export function staffLogin(input: StaffLoginInput): Promise<SessionStaff> {
  return withSessionLock(async () => {
    const { staffLogin } = await request(
      'walletCore',
      staffLoginMutation,
      { input },
      sessionCall(),
    );
    const session = sessionFromPayload(staffLogin);
    saveSession(session);
    return session.staff;
  });
}

/**
 * Revokes the refresh session on the server and clears its cookie. Under the session lock: it waits for a running
 * refresh (and sends the rotated cookie), and a later login keeps its new cookie.
 */
export function staffLogout(): Promise<boolean> {
  return withSessionLock(
    async () =>
      (await request('walletCore', staffLogoutMutation, undefined, sessionCall())).staffLogout,
  );
}
