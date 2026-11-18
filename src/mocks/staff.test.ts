import { acceptStaffInvitation, staffLogin } from '../features/auth/authApi';
import { staffMeQuery } from '../features/auth/auth.wallet-core';
import { changeOwnStaffPasswordMutation } from '../features/profile/profile.wallet-core';
import {
  changeStaffRoleMutation,
  deactivateStaffMutation,
  resendStaffInvitationMutation,
  staffMembersQuery,
} from '../features/staff/staff.wallet-core';
import { refreshSession, request, toRequestError } from '../graphql/client';
import { SESSION_STORAGE_KEY, type SessionStaff, clearSession } from '../graphql/session';
import { ADMIN, signInForTest, SUPPORT, testSession } from '../test/auth';
import { server } from './server';
import {
  MOCK_INVITATION_TOKEN,
  MOCK_INVITED_EMAIL,
  MOCK_PASSWORD,
  mockStaff,
  resetMockStaff,
} from './staff';

/**
 * The mock wallet-core staff contract through the real client (`request`), as the app uses it: the mock must keep
 * the backend's rules, or the component tests prove nothing.
 */
const PASSWORD = 'Strong1234!';
const NEW_PASSWORD = 'Changed1234!';

async function attempt<T>(call: Promise<T>) {
  try {
    return { data: await call };
  } catch (error) {
    return { error: toRequestError(error) };
  }
}

const errorCode = async (call: Promise<unknown>) => (await attempt(call)).error?.code;

const resend = (staffId: string) =>
  request('walletCore', resendStaffInvitationMutation, { staffId });
const changeRole = (staffId: string, role: SessionStaff['role']) =>
  request('walletCore', changeStaffRoleMutation, { staffId, role });
const deactivate = (staffId: string) => request('walletCore', deactivateStaffMutation, { staffId });
const changePassword = (currentPassword: string, newPassword: string) =>
  request('walletCore', changeOwnStaffPasswordMutation, {
    input: { currentPassword, newPassword },
  });
const memberOf = async (email: string) =>
  (await request('walletCore', staffMembersQuery)).staffMembers.find((m) => m.email === email);

/** A second ACTIVE admin, created like in the app: invited, then accepted. */
async function secondAdmin(): Promise<SessionStaff> {
  const { id } = mockStaff.invite('second.admin@example.com', 'ADMIN');
  await acceptStaffInvitation({ token: 'mock-invitation-1', password: PASSWORD });
  return { ...ADMIN, id, email: 'second.admin@example.com' };
}

function useSession(staff: SessionStaff) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(testSession(staff)));
}

describe('mock staff contract: permissions', () => {
  it.each<[string, () => Promise<unknown>]>([
    ['resendStaffInvitation', () => resend('staff-invited')],
    ['changeStaffRole', () => changeRole('staff-support', 'FINANCE')],
    ['deactivateStaff', () => deactivate('staff-invited')],
  ])('%s without bo:staff:modify is FORBIDDEN and changes nothing', async (_name, call) => {
    signInForTest({ staff: SUPPORT });

    expect(await attempt(call())).toEqual({
      error: { message: 'Missing permission: bo:staff:modify', code: 'FORBIDDEN' },
    });

    signInForTest({ staff: ADMIN });
    expect(await memberOf('support@example.com')).toMatchObject({
      role: 'SUPPORT',
      status: 'ACTIVE',
    });
    expect(await memberOf(MOCK_INVITED_EMAIL)).toMatchObject({ status: 'INVITED' });
    expect(await acceptStaffInvitation({ token: MOCK_INVITATION_TOKEN, password: PASSWORD })).toBe(
      true,
    );
  });

  it('changeOwnStaffPassword without bo (the test dev user, no staff login) is FORBIDDEN', async () => {
    expect(await errorCode(changePassword(MOCK_PASSWORD, NEW_PASSWORD))).toBe('FORBIDDEN');
  });
});

describe('mock staff contract: resend invitation', () => {
  beforeEach(() => signInForTest({ staff: ADMIN }));

  it('replaces the token: the old one fails, the new one activates the account', async () => {
    expect((await attempt(resend('staff-invited'))).data).toEqual({
      resendStaffInvitation: {
        id: 'staff-invited',
        email: MOCK_INVITED_EMAIL,
        role: 'SUPPORT',
        status: 'INVITED',
        createdAt: '2026-03-15T08:45:00.000Z',
      },
    });

    expect(
      await errorCode(acceptStaffInvitation({ token: MOCK_INVITATION_TOKEN, password: PASSWORD })),
    ).toBe('INVALID_INVITATION');
    expect(await acceptStaffInvitation({ token: 'mock-invitation-1', password: PASSWORD })).toBe(
      true,
    );
    expect(await memberOf(MOCK_INVITED_EMAIL)).toMatchObject({ status: 'ACTIVE' });
  });

  it('returns no token or link in the response', async () => {
    const { data } = await attempt(resend('staff-invited'));
    expect(JSON.stringify(data)).not.toMatch(/mock-invitation|token|link/i);
  });

  it('answers NOT_INVITED for active and deactivated accounts and STAFF_NOT_FOUND for unknown ids', async () => {
    expect(await errorCode(resend('staff-support'))).toBe('NOT_INVITED');
    await deactivate('staff-invited');
    expect(await errorCode(resend('staff-invited'))).toBe('NOT_INVITED');
    expect(await errorCode(resend('nobody'))).toBe('STAFF_NOT_FOUND');
  });
});

describe('mock staff contract: change role', () => {
  beforeEach(() => signInForTest({ staff: ADMIN }));

  it('changes the role, ends the sessions and gives the new permissions at the next login', async () => {
    // The support member is logged in somewhere: their stored session and refresh cookie.
    signInForTest({ staff: SUPPORT });
    useSession(ADMIN);

    expect((await attempt(changeRole('staff-support', 'FINANCE'))).data?.changeStaffRole).toEqual(
      expect.objectContaining({ id: 'staff-support', role: 'FINANCE', status: 'ACTIVE' }),
    );
    expect(await memberOf('support@example.com')).toMatchObject({ role: 'FINANCE' });

    // Their refresh session is revoked, like wallet-core's `revokeSessions`.
    useSession(SUPPORT);
    expect(await refreshSession()).toBe(false);

    const staff = await staffLogin({ email: 'support@example.com', password: MOCK_PASSWORD });
    expect(staff).toMatchObject({
      role: 'FINANCE',
      permissions: ['bo', 'bo:settings', 'bo:settings:modify'],
    });
    expect((await request('walletCore', staffMeQuery)).staffMe.role).toBe('FINANCE');
  });

  it('keeps the same role without a change and without ending sessions', async () => {
    signInForTest({ staff: SUPPORT });
    useSession(ADMIN);
    expect((await attempt(changeRole('staff-support', 'SUPPORT'))).data?.changeStaffRole.role).toBe(
      'SUPPORT',
    );
    useSession(SUPPORT);
    expect(await refreshSession()).toBe(true);
  });

  it('never demotes the last active admin, also not oneself', async () => {
    expect(await errorCode(changeRole('staff-admin', 'SUPPORT'))).toBe('LAST_ADMIN');
    expect(await memberOf('admin@example.com')).toMatchObject({ role: 'ADMIN' });
  });

  it('demotes an admin while another active admin remains; the remaining one is then the last', async () => {
    const second = await secondAdmin();
    // Issued while `second` is an admin: like a wallet-core JWT it keeps these permissions until it expires.
    const stale = testSession(second);

    expect((await attempt(changeRole(second.id, 'SUPPORT'))).data?.changeStaffRole.role).toBe(
      'SUPPORT',
    );
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stale));
    expect(await errorCode(changeRole('staff-admin', 'FINANCE'))).toBe('LAST_ADMIN');
    expect(await memberOf('admin@example.com')).toMatchObject({ role: 'ADMIN' });
  });

  it('answers STAFF_NOT_FOUND for unknown ids', async () => {
    expect(await errorCode(changeRole('nobody', 'SUPPORT'))).toBe('STAFF_NOT_FOUND');
  });
});

describe('mock staff contract: deactivate', () => {
  beforeEach(() => signInForTest({ staff: ADMIN }));

  it('deactivates, ends the sessions and the login answers the generic INVALID_CREDENTIALS', async () => {
    signInForTest({ staff: SUPPORT });
    useSession(ADMIN);

    expect((await attempt(deactivate('staff-support'))).data?.deactivateStaff).toMatchObject({
      id: 'staff-support',
      status: 'DEACTIVATED',
    });
    expect(await memberOf('support@example.com')).toMatchObject({ status: 'DEACTIVATED' });

    useSession(SUPPORT);
    expect(await refreshSession()).toBe(false);
    clearSession();
    expect(
      await attempt(staffLogin({ email: 'support@example.com', password: MOCK_PASSWORD })),
    ).toEqual({ error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } });
  });

  it('expires the invitation of an invited account', async () => {
    await deactivate('staff-invited');
    expect(
      await errorCode(acceptStaffInvitation({ token: MOCK_INVITATION_TOKEN, password: PASSWORD })),
    ).toBe('INVALID_INVITATION');
  });

  it('is idempotent for an already deactivated account', async () => {
    await deactivate('staff-support');
    expect((await attempt(deactivate('staff-support'))).data?.deactivateStaff.status).toBe(
      'DEACTIVATED',
    );
  });

  it('rejects oneself with CANNOT_DEACTIVATE_SELF', async () => {
    expect(await errorCode(deactivate('staff-admin'))).toBe('CANNOT_DEACTIVATE_SELF');
    expect(await memberOf('admin@example.com')).toMatchObject({ status: 'ACTIVE' });
  });

  it('never deactivates the last active admin', async () => {
    const second = await secondAdmin();
    // `staff-admin` is demoted but still holds an admin access token (valid until it expires).
    const stale = testSession(ADMIN);
    useSession(second);
    await changeRole('staff-admin', 'SUPPORT');
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stale));

    expect(await errorCode(deactivate(second.id))).toBe('LAST_ADMIN');
    useSession(second);
    expect(await memberOf(second.email)).toMatchObject({ status: 'ACTIVE' });
  });

  it('answers STAFF_NOT_FOUND for unknown ids', async () => {
    expect(await errorCode(deactivate('nobody'))).toBe('STAFF_NOT_FOUND');
  });
});

describe('mock staff contract: change own password', () => {
  it('checks the current password and the new password rules', async () => {
    signInForTest({ staff: SUPPORT });
    expect(await errorCode(changePassword('Wrong1234!', NEW_PASSWORD))).toBe(
      'INVALID_CURRENT_PASSWORD',
    );
    expect(await errorCode(changePassword('x'.repeat(129), NEW_PASSWORD))).toBe(
      'INVALID_CURRENT_PASSWORD',
    );
    expect(await attempt(changePassword(MOCK_PASSWORD, 'weak'))).toEqual({
      error: {
        message: 'Password is too weak',
        code: 'BAD_USER_INPUT',
        extensions: { field: 'newPassword' },
      },
    });
  });

  it('a wrong current password does not lock the login', async () => {
    signInForTest({ staff: SUPPORT });
    for (let i = 0; i < 6; i += 1) await attempt(changePassword('Wrong1234!', NEW_PASSWORD));
    clearSession();
    expect(
      await staffLogin({ email: 'support@example.com', password: MOCK_PASSWORD }),
    ).toMatchObject({
      id: 'staff-support',
    });
  });

  it('changes the password, re-issues the current refresh cookie and rejects the pre-change cookie', async () => {
    signInForTest({ staff: SUPPORT });
    // The refresh cookie from before the change, replayed below (stands in for any other session's cookie).
    const previousCookie = document.cookie;

    expect((await attempt(changePassword(MOCK_PASSWORD, NEW_PASSWORD))).data).toEqual({
      changeOwnStaffPassword: true,
    });

    expect(await refreshSession()).toBe(true);
    document.cookie = `${previousCookie}; path=/`;
    expect(await refreshSession()).toBe(false);

    expect(
      await errorCode(staffLogin({ email: 'support@example.com', password: MOCK_PASSWORD })),
    ).toBe('INVALID_CREDENTIALS');
    expect(
      await staffLogin({ email: 'support@example.com', password: NEW_PASSWORD }),
    ).toMatchObject({
      id: 'staff-support',
    });
  });

  it('is FORBIDDEN for a deactivated account that still holds an access token', async () => {
    const supportSession = testSession(SUPPORT);
    signInForTest({ staff: ADMIN });
    await deactivate('staff-support');
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(supportSession));

    expect(await errorCode(changePassword(MOCK_PASSWORD, NEW_PASSWORD))).toBe('FORBIDDEN');
  });
});

describe('mock staff contract: page reload', () => {
  /** A reload: a fresh mock module (in-memory collection rebuilt) with the same cookie and localStorage. */
  async function reload() {
    vi.resetModules();
    const reloaded = await import('./staff');
    server.use(...reloaded.staffAuthHandlers);
  }

  it('keeps the current session after a password change and a reload; the pre-change cookie stays revoked', async () => {
    signInForTest({ staff: SUPPORT });
    const previousCookie = document.cookie;
    await changePassword(MOCK_PASSWORD, NEW_PASSWORD);
    // Only revocation counters are kept, never a password or token.
    expect(localStorage.getItem('mock_staff_session_versions')).toBe('{"staff-support":1}');

    await reload();

    expect(await refreshSession()).toBe(true);
    document.cookie = `${previousCookie}; path=/`;
    expect(await refreshSession()).toBe(false);
  });

  it('a cookie revoked by a role change stays revoked after a reload', async () => {
    signInForTest({ staff: SUPPORT });
    useSession(ADMIN);
    await changeRole('staff-support', 'FINANCE');

    await reload();

    useSession(SUPPORT);
    expect(await refreshSession()).toBe(false);
  });

  it('resetting the mocks forgets the counters, so tests start from the fixtures', async () => {
    signInForTest({ staff: SUPPORT });
    await changePassword(MOCK_PASSWORD, NEW_PASSWORD);

    resetMockStaff();

    expect(localStorage.getItem('mock_staff_session_versions')).toBeNull();
    signInForTest({ staff: SUPPORT });
    expect(document.cookie).toContain('mock_staff_refresh=staff-support.0');
    expect(await refreshSession()).toBe(true);
  });
});
