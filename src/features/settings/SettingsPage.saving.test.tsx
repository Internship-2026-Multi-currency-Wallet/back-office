import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupListeners } from '@reduxjs/toolkit/query';
import { HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { mockSettings, resetMockSettings } from '../../mocks/settings';
import { settingsApi } from './settingsApi';
import {
  countFetches,
  googleSwitch,
  holdUpdates,
  openSettings,
  phoneOption,
  rejected,
  rowOf,
  saved,
  serverSetting,
  walletCore,
} from './testUtils';

const undoButton = () => screen.queryByRole('button', { name: 'Undo' });

beforeEach(() => resetMockSettings());

describe('SettingsPage saving', () => {
  it('shows a change at once, marks it as saving and keeps it after the server confirms', async () => {
    const calls = holdUpdates();
    const user = userEvent.setup();
    await openSettings();

    await user.click(googleSwitch());

    expect(googleSwitch()).not.toBeChecked();
    expect(within(rowOf('Google sign-in')).getByText('Overridden')).toBeInTheDocument();
    expect(screen.getByLabelText('Saving Google sign-in')).toBeInTheDocument();

    await waitFor(() => expect(calls).toHaveLength(1));
    calls[0].release();
    expect(await screen.findByText('Google sign-in saved')).toBeInTheDocument();
    expect(screen.queryByLabelText('Saving Google sign-in')).not.toBeInTheDocument();
    expect(googleSwitch()).not.toBeChecked();
    expect(serverSetting('auth.googleLogin')).toMatchObject({ value: false, overridden: true });
  });

  it('applies the saved value without reloading the table', async () => {
    const fetches = countFetches();
    const user = userEvent.setup();
    await openSettings();

    await user.click(googleSwitch());
    await screen.findByText('Google sign-in saved');

    expect(googleSwitch()).not.toBeChecked();
    expect(fetches()).toBe(1);
  });

  it('rolls back and shows the backend message when the server rejects a value', async () => {
    server.use(
      walletCore.mutation('UpdateSetting', () =>
        rejected('Invalid value for "auth.googleLogin": expected boolean'),
      ),
    );
    const fetches = countFetches();
    const user = userEvent.setup();
    await openSettings();

    await user.click(googleSwitch());

    expect(
      await screen.findByText(/was not saved: Invalid value for "auth.googleLogin"/),
    ).toBeInTheDocument();
    expect(googleSwitch()).toBeChecked();
    expect(within(rowOf('Google sign-in')).getByText('Default')).toBeInTheDocument();
    expect(fetches()).toBe(1);
  });

  it('undoes a change of a default by resetting it, not by writing an override', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(googleSwitch());
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('Google sign-in: change undone')).toBeInTheDocument();
    expect(serverSetting('auth.googleLogin')).toMatchObject({ value: true, overridden: false });
    expect(within(rowOf('Google sign-in')).getByText('Default')).toBeInTheDocument();
    expect(undoButton()).not.toBeInTheDocument();
  });

  it('undoes a change of an override by restoring the previous override', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(phoneOption('signup'));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    await screen.findByText('Phone number required: change undone');
    expect(serverSetting('auth.phoneRequiredAt')).toMatchObject({
      value: 'firstTransfer',
      overridden: true,
    });
    expect(phoneOption('firstTransfer')).toHaveAttribute('aria-pressed', 'true');
  });

  it('undoes a reset by restoring the override', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(
      screen.getByRole('button', { name: 'Reset to default: Phone number required' }),
    );
    await screen.findByText('Phone number required is back to default');
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await screen.findByText('Phone number required: change undone');
    expect(serverSetting('auth.phoneRequiredAt')).toMatchObject({
      value: 'firstTransfer',
      overridden: true,
    });
  });

  it('sends saves of one setting in order and shows the newest choice', async () => {
    const calls = holdUpdates();
    const user = userEvent.setup();
    await openSettings();

    await user.click(googleSwitch());
    await user.click(googleSwitch());
    expect(googleSwitch()).toBeChecked();

    await waitFor(() => expect(calls).toHaveLength(1));
    calls[0].release();
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(googleSwitch()).toBeChecked();
    expect(calls.map((call) => call.variables.value)).toEqual([false, true]);

    calls[1].release();
    await screen.findByText('Google sign-in saved');
    expect(serverSetting('auth.googleLogin')).toMatchObject({ value: true, overridden: true });
    expect(googleSwitch()).toBeChecked();
  });

  it('offers no Undo for a save that a newer save of the same setting replaced', async () => {
    const calls = holdUpdates();
    const user = userEvent.setup();
    await openSettings();

    await user.click(googleSwitch());
    await user.click(googleSwitch());
    await waitFor(() => expect(calls).toHaveLength(1));
    calls[0].release();
    await waitFor(() => expect(calls).toHaveLength(2));

    expect(undoButton()).not.toBeInTheDocument();
    expect(screen.queryByText('Google sign-in saved')).not.toBeInTheDocument();

    calls[1].release();
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('withdraws an Undo as soon as a newer change of the same setting starts', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(googleSwitch());
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();

    const calls = holdUpdates();
    await user.click(googleSwitch());

    expect(undoButton()).not.toBeInTheDocument();
    await waitFor(() => expect(calls).toHaveLength(1));
    calls[0].release();
    await screen.findByRole('button', { name: 'Undo' });
  });

  it('keeps the Undo of one setting when another setting changes', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(googleSwitch());
    await screen.findByText('Google sign-in saved');
    await user.click(phoneOption('signup'));
    await screen.findByText('Phone number required saved');

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByText('Phone number required: change undone');
    expect(serverSetting('auth.googleLogin')).toMatchObject({ value: false, overridden: true });
  });

  it('undoes to the server state when an earlier queued save was rejected', async () => {
    const calls = holdUpdates((variables, call) =>
      call === 1 ? rejected() : saved(variables.key, variables.value),
    );
    const user = userEvent.setup();
    await openSettings();

    await user.click(googleSwitch());
    await user.click(googleSwitch());
    await waitFor(() => expect(calls).toHaveLength(1));
    calls[0].release();
    await waitFor(() => expect(calls).toHaveLength(2));
    calls[1].release();

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await screen.findByText('Google sign-in: change undone');
    expect(serverSetting('auth.googleLogin')).toMatchObject({ value: true, overridden: false });
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument();
  });

  it('keeps a pending save of one setting when a save of another setting is rejected', async () => {
    const calls = holdUpdates((variables) =>
      variables.key === 'auth.googleLogin' ? rejected() : saved(variables.key, variables.value),
    );
    const user = userEvent.setup();
    await openSettings();

    await user.click(phoneOption('signup'));
    await user.click(googleSwitch());
    await waitFor(() => expect(calls).toHaveLength(2));
    calls.find((call) => call.variables.key === 'auth.googleLogin')!.release();
    await screen.findByText(/Google sign-in was not saved/);

    expect(googleSwitch()).toBeChecked();
    expect(phoneOption('signup')).toHaveAttribute('aria-pressed', 'true');
    calls.find((call) => call.variables.key === 'auth.phoneRequiredAt')!.release();
    await screen.findByText('Phone number required saved');
    expect(phoneOption('signup')).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps showing a pending save after the page was left and its cache dropped', async () => {
    const calls = holdUpdates();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { store, router } = await openSettings();

      await user.click(googleSwitch());
      await router.navigate('/');
      await screen.findByRole('heading', { name: 'Back-office' });
      act(() => vi.advanceTimersByTime(61_000));
      expect(store.getState().api.queries['staffSettings(undefined)']).toBeUndefined();
      await router.navigate('/settings');

      expect(await screen.findByRole('switch', { name: 'Google sign-in' })).not.toBeChecked();
      await user.click(googleSwitch());
      expect(googleSwitch()).toBeChecked();

      await waitFor(() => expect(calls).toHaveLength(1));
      calls[0].release();
      await waitFor(() => expect(calls).toHaveLength(2));
      calls[1].release();
      await waitFor(() => expect(serverSetting('auth.googleLogin')).toMatchObject({ value: true }));
      expect(calls.map((call) => call.variables.value)).toEqual([false, true]);
      expect(googleSwitch()).toBeChecked();
    } finally {
      vi.useRealTimers();
    }
  });

  it('undoes to the value shown before the save after the cache was dropped and changed elsewhere', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { router } = await openSettings();

      await user.click(googleSwitch());
      await screen.findByText('Google sign-in saved');
      await router.navigate('/');
      await screen.findByRole('heading', { name: 'Back-office' });
      act(() => vi.advanceTimersByTime(61_000));
      mockSettings.update('auth.googleLogin', true, '200');
      await router.navigate('/settings');

      expect(await screen.findByRole('switch', { name: 'Google sign-in' })).toBeChecked();
      await user.click(googleSwitch());
      await user.click(await screen.findByRole('button', { name: 'Undo' }));

      await screen.findByText('Google sign-in: change undone');
      expect(serverSetting('auth.googleLogin')).toMatchObject({ value: true, overridden: true });
      expect(googleSwitch()).toBeChecked();
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-reads the settings when the page is reopened, so Undo restores what another staff member saved', async () => {
    const user = userEvent.setup();
    const { router } = await openSettings();

    await router.navigate('/');
    await screen.findByRole('heading', { name: 'Back-office' });
    mockSettings.update('auth.googleLogin', false, '200');
    await router.navigate('/settings');

    await waitFor(() => expect(googleSwitch()).not.toBeChecked());
    await user.click(googleSwitch());
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    await screen.findByText('Google sign-in: change undone');
    expect(serverSetting('auth.googleLogin')).toMatchObject({ value: false, overridden: true });
    expect(googleSwitch()).not.toBeChecked();
  });

  it('re-reads the settings when the browser tab regains focus', async () => {
    const { store } = await openSettings();
    const stopListening = setupListeners(store.dispatch);
    try {
      mockSettings.update('auth.googleLogin', false, '200');
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() => expect(googleSwitch()).not.toBeChecked());
    } finally {
      stopListening();
    }
  });

  it('re-reads the settings every 30 seconds while the page is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetches = countFetches();
      await openSettings();
      expect(fetches()).toBe(1);

      mockSettings.update('auth.googleLogin', false, '200');
      act(() => vi.advanceTimersByTime(30_000));

      await waitFor(() => expect(fetches()).toBe(2));
      await waitFor(() => expect(googleSwitch()).not.toBeChecked());
    } finally {
      vi.useRealTimers();
    }
  });

  it('reloads the settings when the answer to a save is lost after the server saved it', async () => {
    server.use(
      walletCore.mutation('UpdateSetting', ({ variables }) => {
        mockSettings.update(variables.key, variables.value, '100');
        return HttpResponse.error();
      }),
    );
    const fetches = countFetches();
    const user = userEvent.setup();
    await openSettings();

    await user.click(googleSwitch());

    expect(await screen.findByText(/Google sign-in was not confirmed/)).toBeInTheDocument();
    await waitFor(() => expect(fetches()).toBe(2));
    await waitFor(() => expect(googleSwitch()).not.toBeChecked());
    expect(within(rowOf('Google sign-in')).getByText('Overridden')).toBeInTheDocument();
  });

  it('bases Undo on the server state when the answer to the previous save was lost', async () => {
    const calls = holdUpdates((variables, call) => {
      const response = saved(variables.key, variables.value);
      return call === 1 ? HttpResponse.error() : response;
    });
    const user = userEvent.setup();
    await openSettings();

    await user.click(phoneOption('signup'));
    await user.click(phoneOption('never'));
    await waitFor(() => expect(calls).toHaveLength(1));
    calls[0].release();
    await waitFor(() => expect(calls).toHaveLength(2));
    calls[1].release();

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2].variables).toEqual({ key: 'auth.phoneRequiredAt', value: 'signup' });
    calls[2].release();
    await screen.findByText('Phone number required: change undone');
    expect(serverSetting('auth.phoneRequiredAt')).toMatchObject({
      value: 'signup',
      overridden: true,
    });
    expect(phoneOption('signup')).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers no Undo when the state before a save cannot be established', async () => {
    let call = 0;
    server.use(
      walletCore.mutation('UpdateSetting', ({ variables }) => {
        call += 1;
        const response = saved(variables.key, variables.value);
        return call === 1 ? HttpResponse.error() : response;
      }),
    );
    countFetches((fetch) => fetch > 1);
    const user = userEvent.setup();
    await openSettings();

    await user.click(googleSwitch());
    await screen.findByText(/Google sign-in was not confirmed/);
    expect(await screen.findByText(/Could not refresh settings/)).toBeInTheDocument();

    await user.click(googleSwitch());
    await screen.findByText('Google sign-in saved');
    expect(undoButton()).not.toBeInTheDocument();
  });

  it('reloads again after a lost answer when an older reload was still running', async () => {
    let release = () => {};
    const slow = new Promise<void>((resolve) => (release = resolve));
    let fetches = 0;
    server.use(
      walletCore.query('StaffSettings', async () => {
        fetches += 1;
        if (fetches !== 2) return undefined;
        const snapshot = mockSettings.list();
        await slow;
        return HttpResponse.json({ data: { staffSettings: snapshot } });
      }),
      walletCore.mutation('UpdateSetting', ({ variables }) => {
        mockSettings.update(variables.key, variables.value, '100');
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    const { store } = await openSettings();

    store.dispatch(settingsApi.endpoints.staffSettings.initiate(undefined, { forceRefetch: true }));
    await waitFor(() => expect(fetches).toBe(2));
    await user.click(googleSwitch());
    await screen.findByText(/Google sign-in was not confirmed/);
    release();

    await waitFor(() => expect(fetches).toBe(3));
    await waitFor(() => expect(googleSwitch()).not.toBeChecked());
    expect(within(rowOf('Google sign-in')).getByText('Overridden')).toBeInTheDocument();
  });

  it('reports the outcome of a save that settles after the page was left and reopened', async () => {
    const calls = holdUpdates(() => rejected('Invalid value for "auth.googleLogin": nope'));
    const user = userEvent.setup();
    const { router } = await openSettings();

    await user.click(googleSwitch());
    await router.navigate('/');
    await screen.findByRole('heading', { name: 'Back-office' });
    await router.navigate('/settings');
    await screen.findByRole('switch', { name: 'Google sign-in' });
    await waitFor(() => expect(calls).toHaveLength(1));
    calls[0].release();

    expect(await screen.findByText(/Google sign-in was not saved/)).toBeInTheDocument();
    expect(googleSwitch()).toBeChecked();
  });

  it('does not let a reload that started before a save overwrite the saved value', async () => {
    let release = () => {};
    const slow = new Promise<void>((resolve) => (release = resolve));
    let fetches = 0;
    server.use(
      walletCore.query('StaffSettings', async () => {
        fetches += 1;
        if (fetches === 1) return undefined;
        const snapshot = mockSettings.list();
        await slow;
        return HttpResponse.json({ data: { staffSettings: snapshot } });
      }),
    );
    const user = userEvent.setup();
    const { store } = await openSettings();

    store.dispatch(settingsApi.endpoints.staffSettings.initiate(undefined, { forceRefetch: true }));
    await waitFor(() => expect(fetches).toBe(2));
    await user.click(googleSwitch());
    await screen.findByText('Google sign-in saved');
    release();

    await waitFor(() =>
      expect(store.getState().api.queries['staffSettings(undefined)']?.status).toBe('fulfilled'),
    );
    expect(googleSwitch()).not.toBeChecked();
    expect(within(rowOf('Google sign-in')).getByText('Overridden')).toBeInTheDocument();
  });

  it('does not let a reload started during a pending save overwrite the saved value', async () => {
    const calls = holdUpdates();
    let release = () => {};
    const slow = new Promise<void>((resolve) => (release = resolve));
    let fetches = 0;
    server.use(
      walletCore.query('StaffSettings', async () => {
        fetches += 1;
        if (fetches === 1) return undefined;
        const snapshot = mockSettings.list();
        await slow;
        return HttpResponse.json({ data: { staffSettings: snapshot } });
      }),
    );
    const user = userEvent.setup();
    const { store } = await openSettings();

    await user.click(googleSwitch());
    await waitFor(() => expect(calls).toHaveLength(1));
    store.dispatch(settingsApi.endpoints.staffSettings.initiate(undefined, { forceRefetch: true }));
    await waitFor(() => expect(fetches).toBe(2));
    calls[0].release();
    await screen.findByText('Google sign-in saved');
    release();

    await waitFor(() =>
      expect(store.getState().api.queries['staffSettings(undefined)']?.status).toBe('fulfilled'),
    );
    expect(googleSwitch()).not.toBeChecked();
    expect(within(rowOf('Google sign-in')).getByText('Overridden')).toBeInTheDocument();
  });
});
