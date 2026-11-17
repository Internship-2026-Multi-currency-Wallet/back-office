import { HttpResponse } from 'msw';
import { staffLoginMutation, staffMeQuery } from '../features/auth/auth.wallet-core';
import { server } from '../mocks/server';
import {
  ADMIN,
  countCalls,
  otherTabWrites,
  signInForTest,
  SUPPORT,
  testSession,
  walletCore,
} from '../test/auth';
import { refreshSession, request, toRequestError } from './client';
import { accessToken, loadSession } from './session';

const staffMe = () => request('walletCore', staffMeQuery);

describe('request with an expired access token', () => {
  it('refreshes once and repeats the request with the new token, in the same session', async () => {
    signInForTest({ expired: true });
    const stale = accessToken();
    const sessionId = loadSession()?.sessionId;
    const refresh = countCalls('StaffRefreshSession');
    const me = countCalls('StaffMe');
    server.use(refresh.handler, me.handler);

    await expect(staffMe()).resolves.toEqual({ staffMe: ADMIN });
    expect(refresh.counter.calls).toBe(1);
    expect(me.counter.calls).toBe(2);
    expect(accessToken()).not.toBe(stale);
    expect(loadSession()?.sessionId).toBe(sessionId);
  });

  it('does not repeat a request after a logout and a new login as the same staff member', async () => {
    signInForTest({ expired: true });
    const refresh = countCalls('StaffRefreshSession');
    let me = 0;
    server.use(
      refresh.handler,
      walletCore.query('StaffMe', () => {
        me += 1;
        otherTabWrites(null); // log out …
        otherTabWrites(testSession(ADMIN)); // … and in again, while the old request is on its way
        return HttpResponse.json({
          errors: [{ message: 'Access token expired', extensions: { code: 'UNAUTHENTICATED' } }],
        });
      }),
    );

    await expect(staffMe()).rejects.toThrow();
    expect(me).toBe(1);
    expect(refresh.counter.calls).toBe(0);
    expect(loadSession()?.staff.id).toBe(ADMIN.id);
  });

  it('refreshes only once for parallel requests in this tab', async () => {
    signInForTest({ expired: true });
    const refresh = countCalls('StaffRefreshSession');
    server.use(refresh.handler);

    const results = await Promise.all([staffMe(), staffMe(), staffMe()]);
    expect(results).toHaveLength(3);
    expect(refresh.counter.calls).toBe(1);
  });

  it('never loops: a second UNAUTHENTICATED is final', async () => {
    signInForTest();
    const refresh = countCalls('StaffRefreshSession');
    let sent = 0;
    server.use(
      refresh.handler,
      walletCore.query('StaffMe', () => {
        sent += 1;
        return HttpResponse.json({
          errors: [{ message: 'Access token expired', extensions: { code: 'UNAUTHENTICATED' } }],
        });
      }),
    );

    await expect(staffMe()).rejects.toThrow();
    expect(refresh.counter.calls).toBe(1);
    expect(sent).toBe(2);
  });

  it('ends the session when the refresh session is over (INVALID_REFRESH_TOKEN)', async () => {
    signInForTest({ expired: true, refreshable: false });
    await expect(staffMe()).rejects.toThrow();
    expect(loadSession()).toBeNull();
  });

  it('keeps the session when the server is down (network / 5xx)', async () => {
    signInForTest({ expired: true });
    server.use(
      walletCore.mutation('StaffRefreshSession', () => HttpResponse.json({}, { status: 503 })),
    );
    await expect(staffMe()).rejects.toThrow();
    expect(loadSession()).not.toBeNull();
  });

  it('does not repeat the request as another staff member who signed in meanwhile', async () => {
    signInForTest({ expired: true });
    let me = 0;
    server.use(
      walletCore.query('StaffMe', () => {
        me += 1;
        return undefined;
      }),
      walletCore.mutation('StaffRefreshSession', () => {
        otherTabWrites(testSession(SUPPORT)); // a login in another tab wins the race
        return undefined;
      }),
    );
    await expect(staffMe()).rejects.toThrow();
    expect(me).toBe(1);
    expect(loadSession()?.staff.id).toBe(SUPPORT.id);
  });
});

describe('refreshSession', () => {
  it('never signs in from the refresh cookie alone (no stored session)', async () => {
    const refresh = countCalls('StaffRefreshSession');
    server.use(refresh.handler);
    await expect(refreshSession()).resolves.toBe(false);
    expect(refresh.counter.calls).toBe(0);
  });

  it('lets a logout that happens during the refresh win', async () => {
    signInForTest({ expired: true });
    server.use(
      walletCore.mutation('StaffRefreshSession', () => {
        otherTabWrites(null);
        return undefined;
      }),
    );
    await expect(refreshSession()).resolves.toBe(false);
    expect(loadSession()).toBeNull();
  });
});

describe('toRequestError', () => {
  it('keeps the code and lockedUntil, but never the request variables', async () => {
    server.use(
      walletCore.mutation('StaffLogin', () =>
        HttpResponse.json({
          errors: [
            {
              message: 'Account is locked',
              extensions: { code: 'ACCOUNT_LOCKED', lockedUntil: '2026-11-17T12:00:00.000Z', x: 1 },
            },
          ],
        }),
      ),
    );
    const error = await request('walletCore', staffLoginMutation, {
      input: { email: 'a@example.com', password: 'Secret123!' },
    }).catch(toRequestError);

    expect(error).toEqual({
      message: 'Account is locked',
      code: 'ACCOUNT_LOCKED',
      extensions: { lockedUntil: '2026-11-17T12:00:00.000Z' },
    });
    expect(JSON.stringify(error)).not.toContain('Secret123!');
  });
});
