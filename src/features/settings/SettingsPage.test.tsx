import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { graphql } from 'msw/graphql';
import { config } from '../../config-env';
import { server } from '../../mocks/server';
import { mockSettings, resetMockSettings } from '../../mocks/settings';
import { renderApp } from '../../test/render';

const walletCore = graphql.link(config.walletCoreUrl);

function rowOf(name: string): HTMLElement {
  const row = within(screen.getByRole('grid', { hidden: true }))
    .getByText(name)
    .closest<HTMLElement>('[role="row"]');
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

const settled = () =>
  waitFor(() => expect(screen.queryByLabelText(/^Saving /)).not.toBeInTheDocument());

async function openSettings() {
  renderApp('/settings');
  await screen.findByText('Google sign-in');
}

beforeEach(() => resetMockSettings());

describe('SettingsPage', () => {
  it('lists every setting with its description, value and source', async () => {
    await openSettings();

    expect(screen.getByRole('heading', { name: /Settings/ })).toBeInTheDocument();
    expect(screen.getByTestId('settings-summary')).toHaveTextContent(
      '2 of 3 settings overridden for this client',
    );

    const google = rowOf('Google sign-in');
    expect(within(google).getByText(/log in with their Google account/)).toBeInTheDocument();
    expect(within(google).getByRole('switch', { name: 'Google sign-in' })).toBeChecked();
    expect(within(google).getByText('Default')).toBeInTheDocument();
    expect(within(google).queryByRole('button', { name: /Reset/ })).not.toBeInTheDocument();

    const phone = rowOf('Phone number required');
    expect(within(phone).getByRole('button', { name: 'firstTransfer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(phone).getByText('Overridden')).toBeInTheDocument();
  });

  it('saves a switch and then shows the value from the server', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('switch', { name: 'Google sign-in' }));

    expect(await screen.findByText('Google sign-in saved')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Google sign-in' })).not.toBeChecked(),
    );
    expect(within(rowOf('Google sign-in')).getByText('Overridden')).toBeInTheDocument();
  });

  it('shows the backend error when a value is rejected and keeps the server value', async () => {
    server.use(
      walletCore.mutation('UpdateSetting', () =>
        HttpResponse.json({
          data: null,
          errors: [
            {
              message: 'Invalid value for "auth.googleLogin": expected boolean',
              extensions: { code: 'INVALID_VALUE' },
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('switch', { name: 'Google sign-in' }));

    expect(
      await screen.findByText(/Invalid value for "auth.googleLogin": expected boolean/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Google sign-in' })).toBeEnabled(),
    );
    expect(screen.getByRole('switch', { name: 'Google sign-in' })).toBeChecked();
    expect(within(rowOf('Google sign-in')).getByText('Default')).toBeInTheDocument();
  });

  it('shows what the server has when the answer to a save is lost', async () => {
    server.use(
      walletCore.mutation('UpdateSetting', ({ variables }) => {
        mockSettings.update(variables.key, variables.value, '100');
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('switch', { name: 'Google sign-in' }));

    expect(await screen.findByText(/Google sign-in was not confirmed/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Google sign-in' })).not.toBeChecked(),
    );
    expect(within(rowOf('Google sign-in')).getByText('Overridden')).toBeInTheDocument();
  });

  it('hides the "default" hint when the override equals the default', async () => {
    const user = userEvent.setup();
    await openSettings();
    const toggle = screen.getByRole('switch', { name: 'Google sign-in' });

    await user.click(toggle);
    await waitFor(() => expect(within(rowOf('Google sign-in')).getByText('default')).toBeVisible());
    await settled();
    await user.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(within(rowOf('Google sign-in')).getByText('Overridden')).toBeInTheDocument();
    expect(within(rowOf('Google sign-in')).queryByText('default')).not.toBeInTheDocument();
  });

  it('gives a new toast its full time even if it replaces another one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await openSettings();

      await user.click(screen.getByRole('switch', { name: 'Google sign-in' }));
      await screen.findByText('Google sign-in saved');
      act(() => vi.advanceTimersByTime(4000));
      await user.click(
        within(rowOf('Phone number required')).getByRole('button', { name: 'signup' }),
      );
      await screen.findByText('Phone number required saved');
      act(() => vi.advanceTimersByTime(3000));

      expect(screen.getByText('Phone number required saved')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('picks an enum value in place', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(
      within(rowOf('Phone number required')).getByRole('button', { name: 'signup' }),
    );

    await waitFor(() =>
      expect(
        within(rowOf('Phone number required')).getByRole('button', { name: 'signup' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('keeps a typed list item when the field loses focus', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('button', { name: 'Add to Enabled products' }));
    await user.type(
      screen.getByRole('textbox', { name: 'New item for Enabled products' }),
      'cards',
    );
    await user.click(screen.getByRole('heading', { name: /Settings/ }));

    await waitFor(() =>
      expect(within(rowOf('Enabled products')).getByText('cards')).toBeInTheDocument(),
    );
  });

  it('adds and removes list items in place and refuses duplicates', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('button', { name: 'Add to Enabled products' }));
    const input = screen.getByRole('textbox', { name: 'New item for Enabled products' });
    await user.type(input, 'wallet{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('already in the list');

    await user.clear(input);
    await user.type(input, 'cards{Enter}');
    await waitFor(() =>
      expect(within(rowOf('Enabled products')).getByText('cards')).toBeInTheDocument(),
    );
    await settled();

    const exchange = within(rowOf('Enabled products'))
      .getByText('exchange')
      .closest('.MuiChip-root');
    await user.click(within(exchange as HTMLElement).getByTestId('CancelIcon'));
    await waitFor(() =>
      expect(within(rowOf('Enabled products')).queryByText('exchange')).not.toBeInTheDocument(),
    );
  });

  it('resets an override to the default', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(
      screen.getByRole('button', { name: 'Reset to default: Phone number required' }),
    );

    await waitFor(() =>
      expect(within(rowOf('Phone number required')).getByText('Default')).toBeInTheDocument(),
    );
    expect(
      within(rowOf('Phone number required')).getByRole('button', { name: 'never' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Phone number required is back to default')).toBeInTheDocument();
    expect(screen.getByTestId('settings-summary')).toHaveTextContent('1 of 3');
  });

  it('shows who changed a setting, when, and old → new', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('button', { name: 'History of Phone number required' }));
    const changes = await screen.findByRole('list', { name: 'Changes' });
    const entries = await within(changes).findAllByRole('listitem');

    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('staff #100');
    expect(within(entries[0]).getByRole('time')).toHaveAttribute(
      'datetime',
      '2026-10-29T15:40:00.000Z',
    );
    expect(within(entries[0]).getByTestId('change-values')).toHaveTextContent(
      'signup→firstTransfer',
    );
    expect(within(entries[1]).getByTestId('change-values')).toHaveTextContent('never→signup');
  });

  it('loads older changes with the keyset cursor, without gaps or repeats', async () => {
    const minute = (id: number) =>
      new Date(Date.UTC(2026, 9, 1, 0, Math.floor((id + 1) / 2))).toISOString();
    mockSettings.seedHistory(
      Array.from({ length: 25 }, (_, index) => {
        const id = 25 - index;
        return {
          id: String(id),
          key: 'auth.googleLogin',
          oldValue: id % 2 === 0,
          newValue: id % 2 !== 0,
          changedBy: '100',
          changedAt: minute(id),
        };
      }),
    );
    const requests: Record<string, unknown>[] = [];
    server.use(
      walletCore.query('SettingHistory', ({ variables }) => {
        requests.push(variables);
        return undefined;
      }),
    );
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('button', { name: 'History of Google sign-in' }));
    const changes = await screen.findByRole('list', { name: 'Changes' });
    expect(await within(changes).findAllByRole('listitem')).toHaveLength(20);

    await user.click(screen.getByRole('button', { name: 'Load older changes' }));

    await waitFor(() => expect(within(changes).getAllByRole('listitem')).toHaveLength(25));
    expect(requests[1]).toMatchObject({ before: minute(6), beforeId: '6' });
    expect(screen.queryByRole('button', { name: 'Load older changes' })).not.toBeInTheDocument();
  });

  it('shows the key of every entry in the history of all settings', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('button', { name: 'All changes' }));

    expect(await screen.findByRole('heading', { name: 'All settings' })).toBeInTheDocument();
    const entries = await within(screen.getByRole('list', { name: 'Changes' })).findAllByRole(
      'listitem',
    );
    expect(entries).toHaveLength(5);
    expect(entries[0]).toHaveTextContent('products.enabled');
    expect(entries[4]).toHaveTextContent('auth.googleLogin');
  });

  it('records a new change in the history', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('switch', { name: 'Google sign-in' }));
    await screen.findByText('Google sign-in saved');

    await user.click(screen.getByRole('button', { name: 'History of Google sign-in' }));
    const changes = await screen.findByRole('list', { name: 'Changes' });
    const [latest] = await within(changes).findAllByRole('listitem');
    expect(within(latest).getByTestId('change-values')).toHaveTextContent('On→Off');
  });

  it('removes only the clicked item of a list with duplicates', async () => {
    const sent: unknown[] = [];
    server.use(
      walletCore.query('StaffSettings', () =>
        HttpResponse.json({
          data: {
            staffSettings: mockSettings
              .list()
              .map((s) =>
                s.key === 'products.enabled' ? { ...s, value: ['wallet', 'wallet'] } : s,
              ),
          },
        }),
      ),
      walletCore.mutation('UpdateSetting', ({ variables }) => {
        sent.push(variables.value);
        return HttpResponse.json({
          data: { updateSetting: mockSettings.update(variables.key, variables.value, '100') },
        });
      }),
    );
    const user = userEvent.setup();
    await openSettings();

    const [first] = within(rowOf('Enabled products')).getAllByTestId('CancelIcon');
    await user.click(first);

    await waitFor(() => expect(sent).toEqual([['wallet']]));
  });

  it('adds an item to a list that already holds duplicates', async () => {
    const sent: unknown[] = [];
    server.use(
      walletCore.query('StaffSettings', () =>
        HttpResponse.json({
          data: {
            staffSettings: mockSettings
              .list()
              .map((s) =>
                s.key === 'products.enabled' ? { ...s, value: ['wallet', 'wallet'] } : s,
              ),
          },
        }),
      ),
      walletCore.mutation('UpdateSetting', ({ variables }) => {
        sent.push(variables.value);
        return HttpResponse.json({
          data: { updateSetting: mockSettings.update(variables.key, variables.value, '100') },
        });
      }),
    );
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('button', { name: 'Add to Enabled products' }));
    await user.type(
      screen.getByRole('textbox', { name: 'New item for Enabled products' }),
      'cards{Enter}',
    );

    await waitFor(() => expect(sent).toEqual([['wallet', 'wallet', 'cards']]));
  });

  it('discards a typed list item on Escape', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('button', { name: 'Add to Enabled products' }));
    await user.type(screen.getByRole('textbox', { name: 'New item for Enabled products' }), 'typo');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox', { name: 'New item for Enabled products' })).toBeNull();
    expect(within(rowOf('Enabled products')).queryByText('typo')).not.toBeInTheDocument();
  });

  it('hides the page and the menu item without bo:settings:modify', async () => {
    server.use(
      walletCore.query('Me', () =>
        HttpResponse.json({
          data: { me: { id: '7', permissions: ['bo:settings'], strategy: 'dev' } },
        }),
      ),
    );
    renderApp('/settings');

    expect(
      await screen.findByText(/You need the bo:settings:modify permission/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('names bo:settings when only bo:settings:modify is granted', async () => {
    server.use(
      walletCore.query('Me', () =>
        HttpResponse.json({
          data: { me: { id: '7', permissions: ['bo:settings:modify'], strategy: 'dev' } },
        }),
      ),
    );
    renderApp('/settings');

    expect(
      await screen.findByText('You need the bo:settings permission to manage settings.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('says "not signed in" when the backend rejects the dev user', async () => {
    server.use(
      walletCore.query('Me', () =>
        HttpResponse.json({
          data: null,
          errors: [{ message: 'Authentication required', extensions: { code: 'UNAUTHENTICATED' } }],
        }),
      ),
    );
    renderApp('/settings');

    expect(await screen.findByText(/Not signed in \(UNAUTHENTICATED\)/)).toBeInTheDocument();
    expect(screen.queryByText(/You need the bo:settings:modify/)).not.toBeInTheDocument();
  });

  it('offers a retry when the profile cannot be loaded for another reason', async () => {
    let networkDown = true;
    server.use(walletCore.query('Me', () => (networkDown ? HttpResponse.error() : undefined)));
    const user = userEvent.setup();
    renderApp('/settings');

    expect(await screen.findByText(/Could not load your profile/)).toBeInTheDocument();
    expect(screen.queryByText(/Not signed in/)).not.toBeInTheDocument();

    const retry = screen.getByRole('button', { name: 'Retry' });
    await waitFor(() => expect(retry).toBeEnabled());
    networkDown = false;
    await user.click(retry);
    expect(await screen.findByText('Google sign-in')).toBeInTheDocument();
  });

  it('shows the menu item to staff with the permission', async () => {
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });
});
