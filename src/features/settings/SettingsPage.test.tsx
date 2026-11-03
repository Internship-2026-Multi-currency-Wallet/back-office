import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { graphql } from 'msw/graphql';
import { config } from '../../config-env';
import { server } from '../../mocks/server';
import { mockSettings, resetMockSettings } from '../../mocks/settings';
import { renderApp } from '../../test/render';

const walletCore = graphql.link(config.walletCoreUrl);

function rowOf(name: string): HTMLElement {
  const row = within(screen.getByRole('table', { hidden: true }))
    .getByText(name)
    .closest<HTMLElement>('tr');
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

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

  it('saves a switch right away and can undo it', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('switch', { name: 'Google sign-in' }));

    expect(await screen.findByText('Google sign-in saved')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Google sign-in' })).not.toBeChecked();
    expect(within(rowOf('Google sign-in')).getByText('Overridden')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(within(rowOf('Google sign-in')).getByText('Default')).toBeInTheDocument(),
    );
    expect(screen.getByRole('switch', { name: 'Google sign-in' })).toBeChecked();
  });

  it('hides the "default" hint when the override equals the default', async () => {
    const user = userEvent.setup();
    await openSettings();
    const toggle = screen.getByRole('switch', { name: 'Google sign-in' });

    await user.click(toggle);
    await waitFor(() => expect(within(rowOf('Google sign-in')).getByText('default')).toBeVisible());
    await user.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(within(rowOf('Google sign-in')).getByText('Overridden')).toBeInTheDocument();
    expect(within(rowOf('Google sign-in')).queryByText('default')).not.toBeInTheDocument();
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

  it('shows a change before the server answers', async () => {
    server.use(
      walletCore.mutation('UpdateSetting', async () => {
        await delay('infinite');
        return HttpResponse.json({ data: null });
      }),
    );
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('switch', { name: 'Google sign-in' }));

    expect(screen.getByRole('switch', { name: 'Google sign-in' })).not.toBeChecked();
    expect(within(rowOf('Google sign-in')).getByText('Overridden')).toBeInTheDocument();
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

    const exchange = within(rowOf('Enabled products'))
      .getByText('exchange')
      .closest('.MuiChip-root');
    await user.click(within(exchange as HTMLElement).getByTestId('CancelIcon'));
    await waitFor(() =>
      expect(within(rowOf('Enabled products')).queryByText('exchange')).not.toBeInTheDocument(),
    );
  });

  it('shows the backend error when a value is rejected and keeps the old value', async () => {
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
      await screen.findByText('Invalid value for "auth.googleLogin": expected boolean'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Google sign-in' })).toBeChecked(),
    );
    expect(within(rowOf('Google sign-in')).getByText('Default')).toBeInTheDocument();
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
    const entries = within(changes).getAllByRole('listitem');

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

  it('records a new change in the history', async () => {
    const user = userEvent.setup();
    await openSettings();

    await user.click(screen.getByRole('switch', { name: 'Google sign-in' }));
    await screen.findByText('Google sign-in saved');

    await user.click(screen.getByRole('button', { name: 'History of Google sign-in' }));
    const changes = await screen.findByRole('list', { name: 'Changes' });
    const [latest] = within(changes).getAllByRole('listitem');
    expect(within(latest).getByTestId('change-values')).toHaveTextContent('On→Off');
  });

  it('drops the previous Undo while a newer save of the same setting is pending', async () => {
    const user = userEvent.setup();
    await openSettings();
    const toggle = screen.getByRole('switch', { name: 'Google sign-in' });

    await user.click(toggle);
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();

    let release = () => {};
    const answered = new Promise<void>((resolve) => (release = resolve));
    server.use(
      walletCore.mutation('UpdateSetting', async ({ variables }) => {
        await answered;
        return HttpResponse.json({
          data: { updateSetting: mockSettings.update(variables.key, variables.value, '100') },
        });
      }),
    );
    await user.click(toggle);

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument(),
    );
    expect(toggle).toBeChecked();

    release();
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(toggle).toBeChecked();
  });

  it('keeps saves of one setting in order across leaving and reopening the page', async () => {
    const sent: unknown[] = [];
    let release = () => {};
    const firstAnswer = new Promise<void>((resolve) => (release = resolve));
    server.use(
      walletCore.mutation('UpdateSetting', async ({ variables }) => {
        sent.push(variables.value);
        if (sent.length === 1) await firstAnswer;
        return HttpResponse.json({
          data: { updateSetting: mockSettings.update(variables.key, variables.value, '100') },
        });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/settings');
    await screen.findByText('Google sign-in');

    await user.click(screen.getByRole('switch', { name: 'Google sign-in' }));
    await router.navigate('/');
    await router.navigate('/settings');
    const toggle = await screen.findByRole('switch', { name: 'Google sign-in' });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(sent).toEqual([false]);

    release();
    await waitFor(() => expect(sent).toEqual([false, true]));
    await waitFor(() =>
      expect(mockSettings.list().find((s) => s.key === 'auth.googleLogin')?.value).toBe(true),
    );
    expect(screen.getByRole('switch', { name: 'Google sign-in' })).toBeChecked();
  });

  it('undoes to the confirmed state when an earlier queued save was rejected', async () => {
    let release = () => {};
    const firstAnswer = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    server.use(
      walletCore.mutation('UpdateSetting', async ({ variables }) => {
        calls += 1;
        if (calls === 1) {
          await firstAnswer;
          return HttpResponse.json({
            data: null,
            errors: [{ message: 'Rejected', extensions: { code: 'INVALID_VALUE' } }],
          });
        }
        return HttpResponse.json({
          data: { updateSetting: mockSettings.update(variables.key, variables.value, '100') },
        });
      }),
    );
    const user = userEvent.setup();
    await openSettings();
    const toggle = screen.getByRole('switch', { name: 'Google sign-in' });

    await user.click(toggle);
    await user.click(toggle);
    release();

    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    await waitFor(() =>
      expect(within(rowOf('Google sign-in')).getByText('Default')).toBeInTheDocument(),
    );
    expect(mockSettings.list().find((s) => s.key === 'auth.googleLogin')).toMatchObject({
      value: true,
      overridden: false,
    });
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument();
  });

  it('shows no Undo for a save that a newer save of the same setting replaced', async () => {
    const releases: (() => void)[] = [];
    server.use(
      walletCore.mutation('UpdateSetting', async ({ variables }) => {
        await new Promise<void>((resolve) => releases.push(resolve));
        return HttpResponse.json({
          data: { updateSetting: mockSettings.update(variables.key, variables.value, '100') },
        });
      }),
    );
    const user = userEvent.setup();
    await openSettings();
    const toggle = screen.getByRole('switch', { name: 'Google sign-in' });

    await user.click(toggle);
    await user.click(toggle);
    await waitFor(() => expect(releases).toHaveLength(1));
    releases[0]();
    await waitFor(() => expect(releases).toHaveLength(2));

    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(toggle).toBeChecked();

    releases[1]();
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(toggle).toBeChecked();
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
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
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
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
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

  it('shows the menu item to staff with the permission', async () => {
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });
});
