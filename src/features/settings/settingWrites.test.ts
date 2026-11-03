import { createStore } from '../../app/store';
import { mockSettings, resetMockSettings } from '../../mocks/settings';
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
