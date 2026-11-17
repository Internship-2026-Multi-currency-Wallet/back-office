import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { SESSION_TIMEOUT_MS } from '../../graphql/client';
import { accessToken, loadSession } from '../../graphql/session';
import { MOCK_PASSWORD } from '../../mocks/staff';
import { server } from '../../mocks/server';
import {
  ADMIN,
  countCalls,
  otherTabWrites,
  signInForTest,
  SUPPORT,
  testSession,
  walletCore,
} from '../../test/auth';
import { renderApp } from '../../test/render';

// Real staff login: no dev user in this file.
vi.mock('../../config-env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config-env')>();
  return { ...actual, config: { ...actual.config, devUser: null } };
});

const currentStaff = () => screen.findByTestId('current-staff');

async function logIn(email: string, password: string) {
  await userEvent.type(await screen.findByLabelText(/Email/), email);
  await userEvent.type(screen.getByLabelText(/Password/), password);
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('login', () => {
  it('redirects an anonymous visitor to Login and back to the page after a login', async () => {
    const { router } = renderApp('/settings');
    expect(await screen.findByRole('heading', { name: 'Log in to Back-office' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');

    await logIn('admin@example.com', MOCK_PASSWORD);

    expect(await currentStaff()).toHaveTextContent('admin@example.com · ADMIN');
    expect(router.state.location.pathname).toBe('/settings');
    expect(await screen.findByText('Google sign-in')).toBeInTheDocument();
    expect(loadSession()?.staff).toEqual(ADMIN);
  });

  it('shows INVALID_CREDENTIALS without revealing whether the account exists', async () => {
    renderApp('/login');
    await logIn('admin@example.com', 'Wrong1234!');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password, or the account is not active.',
    );
    expect(loadSession()).toBeNull();
  });

  it('shows ACCOUNT_LOCKED with the unlock time', async () => {
    server.use(
      walletCore.mutation('StaffLogin', () =>
        HttpResponse.json({
          errors: [
            {
              message: 'Account is locked',
              extensions: { code: 'ACCOUNT_LOCKED', lockedUntil: '2026-11-17T12:15:00.000Z' },
            },
          ],
        }),
      ),
    );
    renderApp('/login');
    await logIn('admin@example.com', MOCK_PASSWORD);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Too many failed attempts\. The account is locked until .*2026/,
    );
  });

  it('locks the account after 5 wrong passwords (mock backend rule)', async () => {
    renderApp('/login');
    for (let attempt = 1; attempt <= 5; attempt++) {
      await userEvent.clear(await screen.findByLabelText(/Email/));
      await userEvent.clear(screen.getByLabelText(/Password/));
      await logIn('admin@example.com', 'Wrong1234!');
      await screen.findByRole('alert');
    }
    expect(screen.getByRole('alert')).toHaveTextContent('locked until');
  });
});

describe('session after a reload', () => {
  it('restores the session and loads staffMe into it (one source of staff data)', async () => {
    // Stale stored data: the backend now says ADMIN.
    signInForTest({ staff: { ...ADMIN, role: 'SUPPORT', permissions: ['bo'] } });
    const me = countCalls('StaffMe');
    server.use(me.handler);
    renderApp('/');

    await waitFor(() => expect(screen.getByTestId('current-staff')).toHaveTextContent('ADMIN'));
    expect(me.counter.calls).toBe(1);
    expect(loadSession()?.staff).toEqual(ADMIN);
  });

  it('refreshes an expired access token while showing nothing private', async () => {
    signInForTest({ expired: true });
    const stale = accessToken();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const refresh = countCalls('StaffRefreshSession', () => held);
    server.use(refresh.handler);
    renderApp('/');

    expect(await screen.findByText('Restoring your session…')).toBeInTheDocument();
    expect(screen.queryByTestId('current-staff')).not.toBeInTheDocument();
    release();
    expect(await currentStaff()).toHaveTextContent('admin@example.com · ADMIN');
    expect(refresh.counter.calls).toBe(1);
    expect(accessToken()).not.toBe(stale);
  });

  it('sends the staff member to Login when the 8-hour session is over', async () => {
    signInForTest({ expired: true, refreshable: false });
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Log in to Back-office' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(loadSession()).toBeNull();
  });

  it('does not log out because the server is temporarily down', async () => {
    signInForTest({ expired: true });
    server.use(
      walletCore.mutation('StaffRefreshSession', () => HttpResponse.json({}, { status: 503 })),
    );
    const { router } = renderApp('/');
    expect(await currentStaff()).toHaveTextContent('admin@example.com');
    expect(router.state.location.pathname).toBe('/');
    expect(loadSession()).not.toBeNull();
  });

  it('stops restoring and keeps the session when StaffMe never answers', async () => {
    // The real 15 s timeout, shortened.
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      expect(ms).toBe(SESSION_TIMEOUT_MS);
      return timeout(50);
    });
    let unblock!: () => void;
    const hung = new Promise<void>((resolve) => (unblock = resolve));
    server.use(walletCore.query('StaffMe', () => hung));
    signInForTest({ expired: true });
    try {
      renderApp('/');
      await screen.findByText('Restoring your session…');
      expect(await currentStaff()).toHaveTextContent('admin@example.com · ADMIN');
      expect(screen.queryByText('Restoring your session…')).not.toBeInTheDocument();
      expect(loadSession()?.staff).toEqual(ADMIN);
    } finally {
      unblock();
      vi.restoreAllMocks();
    }
  });

  it('ignores malformed stored data', async () => {
    localStorage.setItem('wallet.staff.session', JSON.stringify({ accessToken: 't', staff: {} }));
    const me = countCalls('StaffMe');
    server.use(me.handler);
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Log in to Back-office' })).toBeVisible();
    expect(me.counter.calls).toBe(0);
  });
});

const cachedSettings = (store: ReturnType<typeof renderApp>['store']) =>
  Object.values(store.getState().api.queries).filter(
    (query) => query?.endpointName === 'staffSettings' && query.data !== undefined,
  );

describe('logout and identity changes', () => {
  it('logout clears the session, the cookie and every cached query', async () => {
    signInForTest();
    const { router, store } = renderApp('/settings');
    expect(await screen.findByText('Google sign-in')).toBeInTheDocument();
    expect(cachedSettings(store)).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Log in to Back-office' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(loadSession()).toBeNull();
    await waitFor(() => expect(document.cookie).not.toContain('mock_staff_refresh'));
    expect(cachedSettings(store)).toHaveLength(0);

    await act(() => router.navigate('/settings'));
    expect(await screen.findByRole('heading', { name: 'Log in to Back-office' })).toBeVisible();
  });

  it('another staff member signing in (another tab) drops the previous data at once', async () => {
    signInForTest();
    const { store } = renderApp('/settings');
    expect(await screen.findByText('Google sign-in')).toBeInTheDocument();

    act(() => otherTabWrites(testSession(SUPPORT)));

    expect(await currentStaff()).toHaveTextContent('support@example.com · SUPPORT');
    expect(cachedSettings(store)).toHaveLength(0);
    expect(screen.queryByText('Google sign-in')).not.toBeInTheDocument();
  });

  it('a logout in another tab signs this tab out too', async () => {
    signInForTest();
    renderApp('/');
    await currentStaff();
    act(() => otherTabWrites(null));
    expect(await screen.findByRole('heading', { name: 'Log in to Back-office' })).toBeVisible();
  });
});
