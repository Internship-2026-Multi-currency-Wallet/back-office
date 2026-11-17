import { refreshSession } from '../../graphql/client';
import { clearSession, loadSession } from '../../graphql/session';
import { MOCK_PASSWORD } from '../../mocks/staff';
import { server } from '../../mocks/server';
import { signInForTest, walletCore } from '../../test/auth';
import { staffLogin, staffLogout } from './authApi';

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
});
