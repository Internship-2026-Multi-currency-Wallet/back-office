import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../../app/store';
import { request } from '../../graphql/client';
import {
  isAccessTokenExpired,
  loadSession,
  saveSession,
  type SessionStaff,
} from '../../graphql/session';
import { staffMeQuery } from './auth.wallet-core';

/** `restoring`: the stored access token has expired and is being renewed; protected UI waits. */
export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  /** A copy of the stored session's staff member. Tokens stay in `graphql/session.ts`, never in Redux. */
  staff: SessionStaff | null;
}

function initialState(): AuthState {
  const session = loadSession();
  if (!session) return { status: 'anonymous', staff: null };
  if (isAccessTokenExpired(session)) return { status: 'restoring', staff: null };
  return { status: 'authenticated', staff: session.staff };
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionChanged(state, action: PayloadAction<SessionStaff | null>) {
      state.staff = action.payload;
      state.status = action.payload ? 'authenticated' : 'anonymous';
    },
  },
});

export const { sessionChanged } = authSlice.actions;
export const authReducer = authSlice.reducer;
export const selectStaff = (state: RootState) => state.auth.staff;
export const selectAuthStatus = (state: RootState) => state.auth.status;

/**
 * On start, with a stored session: load `staffMe` and keep it IN the session, the only source of staff data.
 * An expired access token is refreshed by `request()` on the way; a finished session (INVALID_REFRESH_TOKEN) is
 * cleared there. A server that is down is not a logout: the stored data stays.
 */
export const restoreSession = () => async (dispatch: AppDispatch) => {
  const started = loadSession();
  if (!started) return;
  try {
    const { staffMe } = await request('walletCore', staffMeQuery);
    const current = loadSession();
    // Another staff member may have signed in meanwhile (e.g. in another tab): never mix the two.
    if (current?.staff.id === staffMe.id) saveSession({ ...current, staff: staffMe });
  } catch {
    // Network / 5xx: keep the session; the next request tries again.
  }
  dispatch(sessionChanged(loadSession()?.staff ?? null));
};
