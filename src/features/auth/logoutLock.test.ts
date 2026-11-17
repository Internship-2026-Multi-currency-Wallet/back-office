import { refreshSession, SESSION_TIMEOUT_MS, toRequestError } from '../../graphql/client';
import { clearSession, loadSession } from '../../graphql/session';
import { MOCK_PASSWORD } from '../../mocks/staff';
import { server } from '../../mocks/server';
import { signInForTest, walletCore } from '../../test/auth';
import { staffLogin, staffLogout } from './authApi';
import { describeLoginError } from './authErrors';

/** jsdom has no Web Locks: a FIFO lock, like `navigator.locks.request` for one name. */
function installFakeLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  const request = (_name: string, callback: () => Promise<unknown>) => {
    const run = tail.then(callback);
    tail = run.catch(() => undefined);
    return run;
  };
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
}

/** Records the order of the auth calls; `hold` keeps an operation until `release` is called. */
function trackAuthCalls(hold: string) {
  const order: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    walletCore.operation(async ({ operationName }) => {
      if (!operationName.startsWith('Staff') || operationName === 'StaffMe') return;
      order.push(`${operationName}:start`);
      if (operationName === hold) await held;
      order.push(`${operationName}:end`);
    }),
  );
  return { order, release };
}

const hasRefreshCookie = () => document.cookie.includes('mock_staff_refresh=');

beforeEach(installFakeLocks);
afterEach(() => {
  delete (navigator as { locks?: unknown }).locks;
});

describe('staffLogout takes the session lock', () => {
  it('waits for a running refresh, and the late refresh does not bring the session back', async () => {
    signInForTest({ expired: true });
    const calls = trackAuthCalls('StaffRefreshSession');
    const refreshing = refreshSession();
    await vi.waitFor(() => expect(calls.order).toContain('StaffRefreshSession:start'));

    clearSession(); // the local logout is immediate
    const loggingOut = staffLogout();
    expect(loadSession()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.order).not.toContain('StaffLogout:start');

    calls.release();
    await expect(refreshing).resolves.toBe(false);
    await expect(loggingOut).resolves.toBe(true);
    expect(calls.order).toEqual([
      'StaffRefreshSession:start',
      'StaffRefreshSession:end',
      'StaffLogout:start',
      'StaffLogout:end',
    ]);
    expect(loadSession()).toBeNull();
    expect(hasRefreshCookie()).toBe(false); // the rotated cookie was sent and revoked
  });

  it('a login right after a logout keeps its new refresh cookie', async () => {
    signInForTest();
    const calls = trackAuthCalls('StaffLogout');

    clearSession();
    const loggingOut = staffLogout();
    const loggingIn = staffLogin({ email: 'admin@example.com', password: MOCK_PASSWORD });
    await vi.waitFor(() => expect(calls.order).toContain('StaffLogout:start'));
    calls.release();

    await expect(loggingOut).resolves.toBe(true);
    await expect(loggingIn).resolves.toMatchObject({ id: 'staff-admin' });
    expect(calls.order).toEqual([
      'StaffLogout:start',
      'StaffLogout:end',
      'StaffLogin:start',
      'StaffLogin:end',
    ]);
    expect(hasRefreshCookie()).toBe(true);
    expect(loadSession()?.staff.id).toBe('staff-admin');
  });

  it('a logout queued behind a running login (another tab) does not revoke that login', async () => {
    signInForTest();
    const before = loadSession()!.sessionId;
    const calls = trackAuthCalls('StaffLogin');
    const loggingIn = staffLogin({ email: 'admin@example.com', password: MOCK_PASSWORD });
    await vi.waitFor(() => expect(calls.order).toContain('StaffLogin:start')); // it holds the lock

    clearSession(); // this tab logs out meanwhile
    const loggingOut = staffLogout();
    calls.release();

    await expect(loggingIn).resolves.toMatchObject({ id: 'staff-admin' });
    await expect(loggingOut).resolves.toBe(false);
    expect(calls.order).toEqual(['StaffLogin:start', 'StaffLogin:end']); // no StaffLogout sent
    expect(loadSession()?.sessionId).not.toBe(before);
    expect(hasRefreshCookie()).toBe(true);
  });
});

describe('a hung login or logout request', () => {
  let unblock: () => void;
  let hung: Promise<void>;

  beforeEach(() => {
    // The real 15 s timeout, shortened: the request is really aborted by `AbortSignal.timeout`.
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      expect(ms).toBe(SESSION_TIMEOUT_MS);
      return timeout(50);
    });
    hung = new Promise<void>((resolve) => (unblock = resolve));
    server.use(
      walletCore.mutation('StaffLogin', async ({ variables }) => {
        if (variables.input.password === 'Hang1234!') await hung;
      }),
    );
  });
  afterEach(() => {
    unblock();
    vi.restoreAllMocks();
  });

  it('login: is cancelled, stores nothing, shows a connection error and frees the lock', async () => {
    const error: unknown = await staffLogin({
      email: 'admin@example.com',
      password: 'Hang1234!',
    }).catch((e: unknown) => e);

    expect((error as Error).name).toBe('TimeoutError');
    expect(loadSession()).toBeNull();
    const shown = toRequestError(error);
    expect(describeLoginError(shown)).toBe(
      'Could not reach the server. Check your connection and try again.',
    );
    expect(JSON.stringify(shown)).not.toContain('Hang1234!');
    // The next operation under the lock runs.
    await expect(staffLogout()).resolves.toBe(true);
  });

  it('logout: the local logout is immediate; the hung request is cancelled and frees the lock', async () => {
    signInForTest();
    server.use(
      walletCore.mutation('StaffLogout', async () => {
        await hung;
      }),
    );

    clearSession();
    const loggingOut = staffLogout().catch((e: unknown) => e);
    expect(loadSession()).toBeNull();

    expect(((await loggingOut) as Error).name).toBe('TimeoutError');
    await expect(
      staffLogin({ email: 'admin@example.com', password: MOCK_PASSWORD }),
    ).resolves.toMatchObject({ id: 'staff-admin' });
  });
});
