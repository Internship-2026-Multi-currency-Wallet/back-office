import { HttpResponse } from 'msw';
import { restoreSession } from '../features/auth/authSlice';
import { settingsApi } from '../features/settings/settingsApi';
import { saveSetting } from '../features/settings/settingWrites';
import { refreshSession, SESSION_TIMEOUT_MS } from '../graphql/client';
import { clearSession, loadSession, SESSION_STORAGE_KEY, saveSession } from '../graphql/session';
import { server } from '../mocks/server';
import { ADMIN, signInForTest, testSession, walletCore } from '../test/auth';
import { createStore } from './store';

const KEY = 'auth.googleLogin';
let release: () => void = () => undefined;
afterEach(() => release());

/** A signed-in store with cached settings and a pending (held) write of `KEY`. */
async function storeWithData() {
  signInForTest({ staff: ADMIN, expired: false });
  const store = createStore();
  await store.dispatch(settingsApi.endpoints.staffSettings.initiate());
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    walletCore.mutation('UpdateSetting', async () => {
      await held;
    }),
  );
  void store.dispatch(saveSetting(KEY, { value: false, overridden: true }));
  await vi.waitFor(() => expect(store.getState().settingWrites.keys[KEY]?.intents).toHaveLength(1));
  return store;
}

const cachedSettings = (store: ReturnType<typeof createStore>) =>
  Object.values(store.getState().api.queries).find(
    (query) => query?.endpointName === 'staffSettings' && query.data !== undefined,
  );

describe('the store drops cached data of a previous session', () => {
  it('log out and log in again as the same staff member', async () => {
    const store = await storeWithData();

    clearSession();
    saveSession(testSession(ADMIN));

    expect(cachedSettings(store)).toBeUndefined();
    expect(store.getState().settingWrites.keys).toEqual({});
    expect(store.getState().auth.staff).toEqual(ADMIN);
  });

  it('late storage events: another tab already logged out and in again as the same staff member', async () => {
    const store = await storeWithData();

    // Both events (removal, then the new login) arrive after the other tab finished: each reads the new session.
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(testSession(ADMIN)));
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));

    expect(cachedSettings(store)).toBeUndefined();
    expect(store.getState().settingWrites.keys).toEqual({});
    expect(store.getState().auth.staff).toEqual(ADMIN);
  });

  it('keeps everything on a refresh: a new access token, the same session', async () => {
    signInForTest({ staff: ADMIN, expired: true });
    const store = createStore();
    await vi.waitFor(() => expect(store.getState().auth.status).toBe('authenticated'));
    await store.dispatch(settingsApi.endpoints.staffSettings.initiate());
    const before = loadSession()!;

    await expect(refreshSession()).resolves.toBe(true);

    expect(loadSession()?.accessToken).not.toBe(before.accessToken);
    expect(loadSession()?.sessionId).toBe(before.sessionId);
    expect(cachedSettings(store)).toBeDefined();
  });
});

it('a late staffMe of the restored session does not overwrite a newer login as the same staff member', async () => {
  const store = createStore(); // nothing stored yet: its own restore ends at once
  signInForTest({ staff: ADMIN });
  let answer!: () => void;
  const held = new Promise<void>((resolve) => (answer = resolve));
  server.use(
    walletCore.query('StaffMe', async () => {
      await held;
      return HttpResponse.json({
        data: { staffMe: { ...ADMIN, role: 'SUPPORT', permissions: ['bo'] } },
      });
    }),
  );
  const restoring = store.dispatch(restoreSession());

  const newer = testSession(ADMIN); // logged out and in again meanwhile
  saveSession(newer);
  answer();
  await restoring;

  expect(loadSession()).toEqual(newer);
  expect(store.getState().auth.staff).toEqual(ADMIN);
});

it('restoration settles when the StaffMe repeated after a refresh never answers', async () => {
  // The 15 s timeouts fire exactly when the repeated StaffMe is on its way (not by the clock: no flakiness).
  const timers: AbortController[] = [];
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    expect(ms).toBe(SESSION_TIMEOUT_MS);
    timers.push(new AbortController());
    return timers.at(-1)!.signal;
  });
  const store = createStore(); // nothing stored yet: its own restore ends at once
  signInForTest({ staff: ADMIN, expired: true });
  const stale = loadSession()!;
  let calls = 0;
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    walletCore.query('StaffMe', async () => {
      calls += 1;
      if (calls !== 2) return; // the first one: the mock answers UNAUTHENTICATED
      timers.forEach((timer) => timer.abort(new DOMException('timed out', 'TimeoutError')));
      await held;
    }),
  );

  try {
    await store.dispatch(restoreSession());
  } finally {
    vi.restoreAllMocks();
  }

  expect(calls).toBe(2);
  expect(loadSession()?.sessionId).toBe(stale.sessionId); // refreshed and kept
  expect(loadSession()?.accessToken).not.toBe(stale.accessToken);
  expect(store.getState().auth).toEqual({ status: 'authenticated', staff: ADMIN });
});
