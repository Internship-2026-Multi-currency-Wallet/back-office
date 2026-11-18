import { HttpResponse } from 'msw';
import { type GraphQLResponseBody, graphql } from 'msw/graphql';
import { config } from '../config-env';
import type {
  AcceptStaffInvitationMutation,
  AcceptStaffInvitationMutationVariables,
  ChangeOwnStaffPasswordInput,
  StaffLoginMutation,
  StaffLoginMutationVariables,
  StaffLogoutMutation,
  StaffMeQuery,
  StaffRefreshSessionMutation,
  StaffMembersQuery,
  StaffRole,
  StaffStatus,
} from '../gql/wallet-core/graphql';

/**
 * Mock of the wallet-core staff auth contract. The HttpOnly `staff_refresh_token` cookie is imitated by a plain
 * `mock_staff_refresh` cookie (`<staffId>.<sessionVersion>`), so a reload keeps the session. Ending a staff member's
 * sessions bumps `sessionVersion`: older refresh cookies stop working, like wallet-core's revoked sessions. Fake
 * passwords only.
 */
const walletCore = graphql.link(config.walletCoreUrl);

export const MOCK_PASSWORD = 'Admin1234!';
export const MOCK_INVITATION_TOKEN = 'mock-invitation';
export const MOCK_INVITED_EMAIL = 'invited@example.com';

const ACCESS_TTL_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const REFRESH_COOKIE = 'mock_staff_refresh';

/** The mock backend's own role table (like wallet-core's `ROLE_PERMISSIONS`); the app never reads it. */
const ROLE_PERMISSIONS: Record<StaffRole, string[]> = {
  ADMIN: ['bo', 'bo:staff', 'bo:staff:modify', 'bo:settings', 'bo:settings:modify'],
  FINANCE: ['bo', 'bo:settings', 'bo:settings:modify'],
  SUPPORT: ['bo'],
  COMPLIANCE: ['bo'],
};

interface MockStaff {
  id: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
  password: string | null;
  invitationToken: string | null;
  failedLogins: number;
  lockedUntil: number | null;
  createdAt: string;
  /** Bumped when wallet-core would revoke the sessions (role change, deactivation, password change). */
  sessionVersion: number;
}

const initialStaff = (): MockStaff[] => [
  {
    id: 'staff-admin',
    email: 'admin@example.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    password: MOCK_PASSWORD,
    invitationToken: null,
    failedLogins: 0,
    lockedUntil: null,
    sessionVersion: 0,
    createdAt: '2026-01-05T09:00:00.000Z',
  },
  {
    id: 'staff-support',
    email: 'support@example.com',
    role: 'SUPPORT',
    status: 'ACTIVE',
    password: MOCK_PASSWORD,
    invitationToken: null,
    failedLogins: 0,
    lockedUntil: null,
    sessionVersion: 0,
    createdAt: '2026-02-10T12:30:00.000Z',
  },
  {
    id: 'staff-invited',
    email: MOCK_INVITED_EMAIL,
    role: 'SUPPORT',
    status: 'INVITED',
    password: null,
    invitationToken: MOCK_INVITATION_TOKEN,
    failedLogins: 0,
    lockedUntil: null,
    sessionVersion: 0,
    createdAt: '2026-03-15T08:45:00.000Z',
  },
];

let staff = initialStaff();
let invitations = 0;

export function resetMockStaff(): void {
  staff = initialStaff();
  invitations = 0;
  clearRefreshCookie();
}

export class MockStaffError extends Error {
  readonly code:
    | 'BAD_USER_INPUT'
    | 'STAFF_ALREADY_EXISTS'
    | 'STAFF_NOT_FOUND'
    | 'NOT_INVITED'
    | 'CANNOT_DEACTIVATE_SELF'
    | 'LAST_ADMIN'
    | 'INVALID_CURRENT_PASSWORD'
    | 'FORBIDDEN';
  readonly extensions: Record<string, string>;

  constructor(
    code: MockStaffError['code'],
    message: string,
    extensions: Record<string, string> = {},
  ) {
    super(message);
    this.code = code;
    this.extensions = extensions;
  }
}

// Close to wallet-core's `z.email()`; the real backend stays authoritative.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 255;
const PASSWORD_MAX_LENGTH = 128;

/** wallet-core's password rules (`registerInputSchema.shape.password`). */
const isStrongPassword = (password: string) =>
  password.length >= 8 &&
  password.length <= PASSWORD_MAX_LENGTH &&
  /\d/.test(password) &&
  /\p{Lu}/u.test(password) &&
  /[^\p{L}\p{N}]/u.test(password);

const toMe = ({ id, email, role }: MockStaff) => ({
  id,
  email,
  role,
  permissions: ROLE_PERMISSIONS[role],
});

type StaffMember = StaffMembersQuery['staffMembers'][number];

const toMember = ({ id, email, role, status, createdAt }: MockStaff): StaffMember => ({
  id,
  email,
  role,
  status,
  createdAt,
});

/** Keep listing and authentication on the same collection so accepted invitations appear without separate synchronization. */
export const mockStaff = {
  list(): StaffMembersQuery['staffMembers'] {
    // Like wallet-core: oldest first, then by id.
    return [...staff]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(toMember);
  },

  /** Like wallet-core `inviteStaff`: one collection, so the invitee can accept and then log in. */
  invite(rawEmail: string, role: StaffRole): StaffMember {
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL.test(email))
      throw new MockStaffError('BAD_USER_INPUT', 'Email must be a valid email address', {
        field: 'email',
      });
    if (email.length > EMAIL_MAX_LENGTH)
      throw new MockStaffError('BAD_USER_INPUT', 'Email must be at most 255 characters', {
        field: 'email',
      });
    // Any status, deactivated included: an email belongs to one staff account.
    if (staff.some((s) => s.email === email))
      throw new MockStaffError(
        'STAFF_ALREADY_EXISTS',
        'Staff member with this email already exists',
      );
    invitations += 1;
    const member: MockStaff = {
      id: `staff-invite-${invitations}`,
      email,
      role,
      status: 'INVITED',
      password: null,
      // Deterministic for tests, never returned or shown: only the invitation link would carry it.
      invitationToken: `mock-invitation-${invitations}`,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
      sessionVersion: 0,
    };
    staff.push(member);
    return toMember(member);
  },

  /** Like wallet-core `resendStaffInvitation`: the earlier token stops working, a new one replaces it. */
  resendInvitation(staffId: string): StaffMember {
    const member = findOrThrow(staffId);
    if (member.status !== 'INVITED')
      throw new MockStaffError('NOT_INVITED', 'Staff member is not in the invited status');
    invitations += 1;
    member.invitationToken = `mock-invitation-${invitations}`;
    return toMember(member);
  },

  /** Like wallet-core `changeStaffRole`: the same role changes nothing; otherwise the target's sessions end. */
  changeRole(staffId: string, role: StaffRole): StaffMember {
    const member = findOrThrow(staffId);
    if (member.role === role) return toMember(member);
    assertNotLastAdmin(member);
    member.role = role;
    member.sessionVersion += 1;
    return toMember(member);
  },

  /** Like wallet-core `deactivateStaff`: never oneself or the last active admin; ends sessions and invitations. */
  deactivate(actorId: string, staffId: string): StaffMember {
    const member = findOrThrow(staffId);
    if (member.id.toLowerCase() === actorId.toLowerCase())
      throw new MockStaffError('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
    if (member.status === 'DEACTIVATED') return toMember(member);
    assertNotLastAdmin(member);
    member.status = 'DEACTIVATED';
    member.sessionVersion += 1;
    member.invitationToken = null;
    return toMember(member);
  },

  /**
   * Like wallet-core `changeOwnStaffPassword`: ends every other session of the caller, keeps the current one (the
   * refresh cookie of this browser, if it is the caller's and still valid).
   */
  changeOwnPassword(staffId: string, input: ChangeOwnStaffPasswordInput): boolean {
    const wrong = () =>
      new MockStaffError('INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
    if (input.currentPassword.length > PASSWORD_MAX_LENGTH) throw wrong();
    if (!isStrongPassword(input.newPassword))
      throw new MockStaffError('BAD_USER_INPUT', 'Password is too weak', { field: 'newPassword' });
    const member = staff.find((s) => s.id === staffId);
    if (member?.status !== 'ACTIVE' || member.password === null)
      throw new MockStaffError('FORBIDDEN', 'Account is not active');
    // A wrong current password does not count toward the login lockout, as in wallet-core.
    if (input.currentPassword !== member.password) throw wrong();
    const keepsCurrent = refreshCookieMember() === member;
    member.password = input.newPassword;
    member.sessionVersion += 1;
    if (keepsCurrent) setRefreshCookie(member.id);
    return true;
  },
};

function findOrThrow(staffId: string): MockStaff {
  const member = staff.find((s) => s.id === staffId);
  if (!member) throw new MockStaffError('STAFF_NOT_FOUND', 'Staff member not found');
  return member;
}

/** Only an ACTIVE admin counts; wallet-core checks it the same way before a demotion or deactivation. */
function assertNotLastAdmin(target: MockStaff): void {
  if (target.status !== 'ACTIVE' || target.role !== 'ADMIN') return;
  const admins = staff.filter((s) => s.status === 'ACTIVE' && s.role === 'ADMIN');
  if (admins.length === 1)
    throw new MockStaffError(
      'LAST_ADMIN',
      'The last active admin cannot be deactivated or demoted',
    );
}

/**
 * `mock-staff.<staffId>.<expiresAtMs>.<permissions>`: stateless, so handlers can check it without a session store.
 * Like the wallet-core access JWT it carries the permissions of the role at issue time: after a role change or a
 * deactivation it keeps working until it expires; only the refresh is refused.
 */
export function mockAccessToken(staffId: string, expiresAt = Date.now() + ACCESS_TTL_MS): string {
  const member = staff.find((s) => s.id === staffId);
  const permissions = member ? ROLE_PERMISSIONS[member.role] : [];
  return `mock-staff.${staffId}.${expiresAt}.${permissions.join(',')}`;
}

/** The staff member of a still valid mock access token, with the permissions the token carries. */
export function staffFromBearer(
  authorization: string | null,
): { id: string; permissions: string[] } | null {
  const match = /^Bearer mock-staff\.([^.]+)\.(\d+)\.([^.]*)$/.exec(authorization ?? '');
  if (!match || Number(match[2]) <= Date.now()) return null;
  const member = staff.find((s) => s.id === match[1]);
  return member ? { id: member.id, permissions: match[3].split(',').filter(Boolean) } : null;
}

/** A session of this staff member as it is now: ending their sessions later makes this cookie invalid. */
export function setRefreshCookie(staffId: string): void {
  const version = staff.find((s) => s.id === staffId)?.sessionVersion ?? 0;
  document.cookie = `${REFRESH_COOKIE}=${staffId}.${version}; path=/; max-age=${8 * 3600}`;
}

function clearRefreshCookie(): void {
  document.cookie = `${REFRESH_COOKIE}=; path=/; max-age=0`;
}

/** The ACTIVE staff member whose session the refresh cookie still is, or `null` (missing, revoked or inactive). */
function refreshCookieMember(): MockStaff | null {
  const value = new RegExp(`(?:^|; )${REFRESH_COOKIE}=([^;]+)`).exec(document.cookie)?.[1] ?? '';
  const match = /^(.+)\.(\d+)$/.exec(value);
  const member = match && staff.find((s) => s.id === match[1]);
  if (!member || member.status !== 'ACTIVE' || member.sessionVersion !== Number(match[2]))
    return null;
  return member;
}

const fail = (code: string, message: string, extensions: Record<string, string> = {}) =>
  HttpResponse.json<GraphQLResponseBody<never>>({
    errors: [{ message, extensions: { ...extensions, code } }],
  });

function payload(member: MockStaff) {
  const expiresAt = Date.now() + ACCESS_TTL_MS;
  return {
    accessToken: mockAccessToken(member.id, expiresAt),
    accessTokenExpiresAt: new Date(expiresAt).toISOString(),
    staff: toMe(member),
  };
}

export const staffAuthHandlers = [
  walletCore.mutation<StaffLoginMutation, StaffLoginMutationVariables>(
    'StaffLogin',
    ({ variables }) => {
      const { email, password } = variables.input;
      const member = staff.find((s) => s.email === email.trim().toLowerCase());
      // Unknown email, inactive account and wrong password look the same on purpose.
      if (member?.status !== 'ACTIVE')
        return fail('INVALID_CREDENTIALS', 'Invalid email or password');
      const locked = () => {
        const until = new Date(member.lockedUntil!).toISOString();
        return fail('ACCOUNT_LOCKED', 'Account is locked', { lockedUntil: until });
      };
      if (member.lockedUntil !== null && member.lockedUntil > Date.now()) return locked();
      if (password !== member.password) {
        member.failedLogins += 1;
        if (member.failedLogins < MAX_FAILED_LOGINS) {
          return fail('INVALID_CREDENTIALS', 'Invalid email or password');
        }
        member.failedLogins = 0;
        member.lockedUntil = Date.now() + LOCK_MS;
        return locked();
      }
      member.failedLogins = 0;
      member.lockedUntil = null;
      setRefreshCookie(member.id);
      return HttpResponse.json({ data: { staffLogin: payload(member) } });
    },
  ),

  walletCore.mutation<AcceptStaffInvitationMutation, AcceptStaffInvitationMutationVariables>(
    'AcceptStaffInvitation',
    ({ variables }) => {
      const { token, password } = variables.input;
      // wallet-core checks the password before the token.
      if (!isStrongPassword(password))
        return fail('BAD_USER_INPUT', 'Password is too weak', { field: 'password' });
      const member = staff.find((s) => s.status === 'INVITED' && s.invitationToken === token);
      if (!member) return fail('INVALID_INVITATION', 'Invitation is invalid or expired');
      member.status = 'ACTIVE';
      member.password = password;
      member.invitationToken = null;
      return HttpResponse.json({ data: { acceptStaffInvitation: true } });
    },
  ),

  walletCore.mutation<StaffRefreshSessionMutation>('StaffRefreshSession', () => {
    const member = refreshCookieMember();
    if (!member) return fail('INVALID_REFRESH_TOKEN', 'Session expired, please log in again');
    return HttpResponse.json({ data: { staffRefreshSession: payload(member) } });
  }),

  walletCore.mutation<StaffLogoutMutation>('StaffLogout', () => {
    clearRefreshCookie();
    return HttpResponse.json({ data: { staffLogout: true } });
  }),

  walletCore.query<StaffMeQuery>('StaffMe', ({ request }) => {
    const caller = staffFromBearer(request.headers.get('authorization'));
    if (!caller) return fail('UNAUTHENTICATED', 'Authentication required');
    return HttpResponse.json({ data: { staffMe: toMe(staff.find((s) => s.id === caller.id)!) } });
  }),
];
