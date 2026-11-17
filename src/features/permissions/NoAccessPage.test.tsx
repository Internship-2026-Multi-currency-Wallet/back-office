import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { loadSession } from '../../graphql/session';
import { server } from '../../mocks/server';
import { ADMIN, countCalls, signInForTest, SUPPORT, walletCore } from '../../test/auth';
import { renderApp } from '../../test/render';

/** A signed-in staff member with exactly these permissions (also what `staffMe` answers after the reload). */
function signInWith(permissions: string[]) {
  const staff = { ...SUPPORT, permissions };
  signInForTest({ staff });
  server.use(walletCore.query('StaffMe', () => HttpResponse.json({ data: { staffMe: staff } })));
}

const menuLink = (name: string) => screen.queryByRole('link', { name });
const noAccess = () => screen.findByRole('heading', { name: 'No Access' });

describe('permission-based navigation', () => {
  it('shows Settings in the menu and opens it with the Settings permissions', async () => {
    signInForTest({ staff: ADMIN });
    renderApp('/');

    await userEvent.click(await screen.findByRole('link', { name: 'Settings' }));

    expect(await screen.findByText('Google sign-in')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No Access' })).not.toBeInTheDocument();
  });

  it('without them hides Settings and shows No Access on /settings, keeping the session', async () => {
    signInForTest({ staff: SUPPORT });
    const settings = countCalls('StaffSettings');
    server.use(settings.handler);
    const { router } = renderApp('/');
    expect(await screen.findByTestId('current-staff')).toHaveTextContent('support@example.com');
    expect(menuLink('Settings')).not.toBeInTheDocument();
    expect(menuLink('Users')).not.toBeInTheDocument();

    await act(() => router.navigate('/settings'));

    expect(await noAccess()).toBeInTheDocument();
    expect(
      screen.getByText(/You need the bo:settings and bo:settings:modify permissions\./),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings');
    expect(screen.getByTestId('current-staff')).toHaveTextContent('support@example.com');
    expect(settings.counter.calls).toBe(0);

    await userEvent.click(screen.getByRole('link', { name: 'Go home' }));
    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByRole('heading', { name: 'Back-office' })).toBeInTheDocument();
    expect(loadSession()?.staff.id).toBe(SUPPORT.id);
  });

  it('shows No Access when /users is opened directly without bo:users', async () => {
    signInForTest({ staff: ADMIN });
    renderApp('/users');

    expect(await noAccess()).toBeInTheDocument();
    expect(screen.getByText(/You need the bo:users permission\./)).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(menuLink('Users')).not.toBeInTheDocument();
    expect(menuLink('Settings')).toBeInTheDocument();
  });

  it('opens Users with bo:users and keeps its modify action gated', async () => {
    signInWith(['bo', 'bo:users']);
    renderApp('/users');

    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(await screen.findByRole('grid')).toBeInTheDocument();
    expect(menuLink('Users')).toBeInTheDocument();
    expect(menuLink('Settings')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add user' })).not.toBeInTheDocument();
  });

  it('still shows the 404 page for an unknown URL without extra permissions', async () => {
    signInForTest({ staff: SUPPORT });
    renderApp('/does-not-exist');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No Access' })).not.toBeInTheDocument();
    expect(await screen.findByTestId('current-staff')).toHaveTextContent('support@example.com');
  });
});
