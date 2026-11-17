import { screen } from '@testing-library/react';
import { server } from '../../mocks/server';
import { countCalls, signInForTest } from '../../test/auth';
import { renderApp } from '../../test/render';

// Vitest runs with VITE_DEV_USER (vite.config.ts): dev mode as before E1-8.
describe('dev mode (VITE_DEV_USER, no staff session)', () => {
  it('opens the app as the dev user without Login, refresh or staffMe', async () => {
    const refresh = countCalls('StaffRefreshSession');
    const staffMe = countCalls('StaffMe');
    server.use(refresh.handler, staffMe.handler);
    const { router } = renderApp('/');

    expect(await screen.findByTestId('me')).toHaveTextContent('Dev user: 100');
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    expect(refresh.counter.calls + staffMe.counter.calls).toBe(0);
  });

  it('a staff session wins over the dev user', async () => {
    signInForTest();
    renderApp('/');
    expect(await screen.findByTestId('current-staff')).toHaveTextContent('admin@example.com');
    expect(await screen.findByTestId('me')).toHaveTextContent('Signed in: staff-admin');
  });
});
