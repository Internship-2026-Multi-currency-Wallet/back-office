import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { authReducer, restoreSession, sessionChanged } from '../features/auth/authSlice';
import { settingWritesReducer } from '../features/settings/settingWrites';
import { loadSession, onSessionChange } from '../graphql/session';
import { api } from './api';

let detachSessionSync: (() => void) | undefined;

/** Root store. Each feature adds its slice here in a small, dedicated PR. */
export function createStore() {
  const store = configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      auth: authReducer,
      settingWrites: settingWritesReducer,
    },
    middleware: (getDefault) => getDefault().concat(api.middleware),
    // RTK enables DevTools by default, also in production builds.
    devTools: import.meta.env.DEV,
  });

  detachSessionSync?.(); // a replaced store (tests, hot reload) stops listening
  // By session, not by staff id: a new login as the same staff member is a new session too; a refresh keeps it.
  let sessionId = loadSession()?.sessionId;
  detachSessionSync = onSessionChange((session) => {
    const isNewSession = session?.sessionId !== sessionId;
    sessionId = session?.sessionId;
    store.dispatch(sessionChanged(session?.staff ?? null));
    // Nothing of the previous session (or of the dev user) may stay cached.
    if (isNewSession) store.dispatch(api.util.resetApiState());
  });
  void store.dispatch(restoreSession());
  return store;
}

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
