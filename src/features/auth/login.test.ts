import { ClientError } from 'graphql-request';
import { createStore } from '../../app/store';
import { hasErrorCode } from '../../graphql/client';
import { loadSession } from '../../graphql/session';
import { MOCK_PASSWORD } from '../../mocks/staff';
import { ADMIN } from '../../test/auth';
import { showSettingNotice } from '../settings/settingWrites';
import { systemApi } from '../system/systemApi';
import { staffLogin } from './authApi';

// Regression: as an RTK Query mutation, a successful login answered `AbortError`. Storing the session changes the
// identity, the store resets the API state, and `resetApiState` aborts every running mutation, the login too.
describe('staffLogin with the identity sync of the store', () => {
  it('resolves with the staff member and drops what the previous identity (dev user) had', async () => {
    const store = createStore();
    // Data of the previous identity: the dev user's `me` and a settings notice.
    await store.dispatch(systemApi.endpoints.me.initiate());
    store.dispatch(showSettingNotice({ key: 'x', severity: 'success', message: 'saved' }));
    expect(systemApi.endpoints.me.select()(store.getState()).data?.id).toBe('100');

    await expect(
      staffLogin({ email: 'admin@example.com', password: MOCK_PASSWORD }),
    ).resolves.toEqual(ADMIN);

    expect(store.getState().auth).toEqual({ status: 'authenticated', staff: ADMIN });
    expect(loadSession()?.staff).toEqual(ADMIN);
    expect(systemApi.endpoints.me.select()(store.getState()).data).toBeUndefined();
    expect(store.getState().settingWrites).toMatchObject({ keys: {}, notice: null });
  });

  it('rejects a wrong password with INVALID_CREDENTIALS and stores nothing', async () => {
    const store = createStore();
    const error: unknown = await staffLogin({
      email: 'admin@example.com',
      password: 'Wrong1234!',
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ClientError);
    expect(hasErrorCode(error, 'INVALID_CREDENTIALS')).toBe(true);
    expect(loadSession()).toBeNull();
    expect(store.getState().auth.staff).toBeNull();
  });
});
