import { HttpResponse } from 'msw';
import { type GraphQLResponseBody, graphql } from 'msw/graphql';
import { config } from '../config-env';
import type {
  AcceptStaffInvitationMutation,
  AcceptStaffInvitationMutationVariables,
  StaffLoginMutation,
  StaffLoginMutationVariables,
  StaffLogoutMutation,
  StaffMeQuery,
  StaffRefreshSessionMutation,
  StaffRole,
} from '../gql/wallet-core/graphql';

/**
 * Mock of the wallet-core staff auth contract. The HttpOnly `staff_refresh_token` cookie is imitated by a plain
 * `mock_staff_refresh` cookie, so a reload keeps the session. Fake passwords only.
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
  status: 'INVITED' | 'ACTIVE';
  password: string | null;
  invitationToken: string | null;
  failedLogins: number;
  lockedUntil: number | null;
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
  },
];

let staff = initialStaff();

export function resetMockStaff(): void {
  staff = initialStaff();
  clearRefreshCookie();
}

const toMe = ({ id, email, role }: MockStaff) => ({
  id,
  email,
  role,
  permissions: ROLE_PERMISSIONS[role],
});

/** `mock-staff.<staffId>.<expiresAtMs>`: stateless, so handlers can check it without a session store. */
export function mockAccessToken(staffId: string, expiresAt = Date.now() + ACCESS_TTL_MS): string {
  return `mock-staff.${staffId}.${expiresAt}`;
}

/** The staff member of a still valid mock access token, with their permissions. */
export function staffFromBearer(
  authorization: string | null,
): { id: string; permissions: string[] } | null {
  const match = /^Bearer mock-staff\.([^.]+)\.(\d+)$/.exec(authorization ?? '');
  if (!match || Number(match[2]) <= Date.now()) return null;
  const member = staff.find((s) => s.id === match[1]);
  return member ? { id: member.id, permissions: ROLE_PERMISSIONS[member.role] } : null;
}

export function setRefreshCookie(staffId: string): void {
  document.cookie = `${REFRESH_COOKIE}=${staffId}; path=/; max-age=${8 * 3600}`;
}

function clearRefreshCookie(): void {
  document.cookie = `${REFRESH_COOKIE}=; path=/; max-age=0`;
}

function refreshCookieStaffId(): string | null {
  return new RegExp(`(?:^|; )${REFRESH_COOKIE}=([^;]+)`).exec(document.cookie)?.[1] ?? null;
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
      const strong =
        password.length >= 8 &&
        password.length <= 128 &&
        /\d/.test(password) &&
        /\p{Lu}/u.test(password) &&
        /[^\p{L}\p{N}]/u.test(password);
      // wallet-core checks the password before the token.
      if (!strong) return fail('BAD_USER_INPUT', 'Password is too weak', { field: 'password' });
      const member = staff.find((s) => s.status === 'INVITED' && s.invitationToken === token);
      if (!member) return fail('INVALID_INVITATION', 'Invitation is invalid or expired');
      member.status = 'ACTIVE';
      member.password = password;
      member.invitationToken = null;
      return HttpResponse.json({ data: { acceptStaffInvitation: true } });
    },
  ),

  walletCore.mutation<StaffRefreshSessionMutation>('StaffRefreshSession', () => {
    const id = refreshCookieStaffId();
    const member = staff.find((s) => s.id === id);
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
