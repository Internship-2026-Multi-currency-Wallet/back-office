import { createStore } from '../../app/store';
import { accessToken, type SessionStaff } from '../../graphql/session';
import { server } from '../../mocks/server';
import { mockSettings, resetMockSettings } from '../../mocks/settings';
import {
  ADMIN,
  countCalls,
  otherTabWrites,
  signInForTest,
  SUPPORT,
  testSession,
  walletCore,
} from '../../test/auth';
import { settingsApi } from './settingsApi';
import { saveSetting, undoSetting } from './settingWrites';

beforeEach(() => resetMockSettings());

describe('undoSetting', () => {
  it('refuses to undo a save that a newer save of the same setting replaced', async () => {
    const store = createStore();
    await store.dispatch(settingsApi.endpoints.staffSettings.initiate());

    const first = await store.dispatch(
      saveSetting('auth.googleLogin', { value: false, overridden: true }),
    );
    await store.dispatch(saveSetting('auth.googleLogin', { value: true, overridden: true }));

    expect(first).toMatchObject({ status: 'saved', previous: { value: true, overridden: false } });
    expect(store.dispatch(undoSetting('auth.googleLogin', first))).toBeUndefined();
    expect(mockSettings.list().find((s) => s.key === 'auth.googleLogin')).toMatchObject({
      value: true,
      overridden: true,
    });
  });

  it('undoes the latest save of a setting', async () => {
    const store = createStore();
    await store.dispatch(settingsApi.endpoints.staffSettings.initiate());

    const outcome = await store.dispatch(
      saveSetting('auth.googleLogin', { value: false, overridden: true }),
    );
    const undone = await store.dispatch(undoSetting('auth.googleLogin', outcome));

    expect(undone).toMatchObject({ status: 'saved' });
    expect(mockSettings.list().find((s) => s.key === 'auth.googleLogin')).toMatchObject({
      value: true,
      overridden: false,
    });
  });
});

const KEY = 'auth.googleLogin';

async function signedInStore() {
  signInForTest({ staff: ADMIN });
  const store = createStore();
  await store.dispatch(settingsApi.endpoints.staffSettings.initiate());
  return store;
}

describe('identity change', () => {
  it('drops the notice, its Undo, intents and confirmed values of the previous staff member', async () => {
    const store = await signedInStore();
    const outcome = await store.dispatch(saveSetting(KEY, { value: false, overridden: true }));
    expect(store.getState().settingWrites.notice).toMatchObject({ key: KEY, undo: outcome });
    expect(store.getState().settingWrites.keys[KEY].confirmed).toBeDefined();

    otherTabWrites(testSession(SUPPORT));

    expect(store.getState().settingWrites).toEqual({ keys: {}, notice: null, session: 1 });
    expect(store.dispatch(undoSetting(KEY, outcome))).toBeUndefined();
  });

  it.each<[string, SessionStaff, () => void]>([
    ['another staff member signs in', SUPPORT, () => otherTabWrites(testSession(SUPPORT))],
    [
      'the same staff member logs out and in again',
      ADMIN,
      () => {
        otherTabWrites(null);
        otherTabWrites(testSession(ADMIN));
      },
    ],
  ])('never sends a queued write of the previous session when %s', async (_, staff, change) => {
    const store = await signedInStore();
    const tokenA = accessToken();
    const sentWith: (string | null)[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      walletCore.mutation('UpdateSetting', async ({ request }) => {
        sentWith.push(request.headers.get('authorization'));
        await held; // then the default mock answers
      }),
    );

    const first = store.dispatch(saveSetting(KEY, { value: false, overridden: true }));
    const second = store.dispatch(saveSetting(KEY, { value: true, overridden: true }));
    await vi.waitFor(() => expect(sentWith).toHaveLength(1));
    const reads = countCalls('StaffSettings');
    server.use(reads.handler);
    change();
    expect(accessToken()).not.toBe(tokenA);
    expect(store.getState().auth.staff?.id).toBe(staff.id);
    release();

    // The first write was already on its way with A's token; its answer is ignored.
    await expect(first).resolves.toMatchObject({ status: 'rejected' });
    await expect(second).resolves.toMatchObject({
      status: 'rejected',
      message: 'the session changed',
    });
    expect(sentWith).toEqual([`Bearer ${tokenA}`]);
    expect(reads.counter.calls).toBe(0); // no refresh for a stale write either
    expect(store.getState().settingWrites).toMatchObject({ keys: {}, notice: null });
    // Only A's write, sent before the change, reaches the server.
    await vi.waitFor(() =>
      expect(mockSettings.list().find((s) => s.key === KEY)).toMatchObject({ value: false }),
    );
  });
});

describe('queues of a new session', () => {
  it('a write of the new session does not wait for a hung write of the previous one', async () => {
    const store = await signedInStore();
    const tokenA = accessToken();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      walletCore.mutation('UpdateSetting', async ({ request }) => {
        if (request.headers.get('authorization') === `Bearer ${tokenA}`) await held;
      }),
    );
    const old = store.dispatch(saveSetting(KEY, { value: false, overridden: true }));
    await vi.waitFor(() =>
      expect(store.getState().settingWrites.keys[KEY]?.intents).toHaveLength(1),
    );

    otherTabWrites(null);
    otherTabWrites(testSession(ADMIN));
    await store.dispatch(settingsApi.endpoints.staffSettings.initiate());
    // Not released: A's request still hangs on the server. The identity change (`resetApiState`) aborted A's
    // running mutation, so the per-key queue does not hold this write.
    await expect(
      store.dispatch(saveSetting(KEY, { value: true, overridden: true })),
    ).resolves.toMatchObject({ status: 'saved' });

    release();
    await expect(old).resolves.toMatchObject({ status: 'rejected' });
    // A's late answer changes nothing of the new session.
    expect(store.getState().settingWrites.keys[KEY].confirmed).toMatchObject({ value: true });
    expect(store.getState().settingWrites.notice).toMatchObject({
      message: 'Google sign-in saved',
    });
  });
});
