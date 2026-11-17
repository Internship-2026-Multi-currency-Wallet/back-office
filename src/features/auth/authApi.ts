import type { StaffLoginInput } from '../../gql/wallet-core/graphql';
import { request, type RequestOptions } from '../../graphql/client';
import {
  saveSession,
  type SessionStaff,
  sessionFromPayload,
  withSessionLock,
} from '../../graphql/session';
import { staffLoginMutation, staffLogoutMutation } from './auth.wallet-core';

// Plain functions, not RTK Query mutations: a login or logout changes the identity, the store then dispatches
// `resetApiState`, and that aborts every running mutation, so a mutation would report `AbortError` after success.

/** These calls create or end the session: an `UNAUTHENTICATED` is their answer, never a reason to refresh. */
const NO_SESSION_RETRY: RequestOptions = { retryOnUnauthenticated: false };

/** Logs in and stores the session. Under the session lock until the cookie and the stored session agree. */
export function staffLogin(input: StaffLoginInput): Promise<SessionStaff> {
  return withSessionLock(async () => {
    const { staffLogin } = await request(
      'walletCore',
      staffLoginMutation,
      { input },
      NO_SESSION_RETRY,
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
      (await request('walletCore', staffLogoutMutation, undefined, NO_SESSION_RETRY)).staffLogout,
  );
}
