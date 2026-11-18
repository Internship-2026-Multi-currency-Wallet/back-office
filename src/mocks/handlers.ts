import { HttpResponse } from 'msw';
import { graphql } from 'msw/graphql';
import { config } from '../config-env';
import type { RatesServiceHealthQuery } from '../gql/rates-service/graphql';
import type { TreasuryServiceHealthQuery } from '../gql/treasury-service/graphql';
import type {
  MeQuery,
  ResetSettingMutation,
  ResetSettingMutationVariables,
  SettingHistoryQuery,
  SettingHistoryQueryVariables,
  StaffMembersQuery,
  StaffSettingsQuery,
  UpdateSettingMutation,
  UpdateSettingMutationVariables,
  WalletCoreHealthQuery,
} from '../gql/wallet-core/graphql';
import { MockSettingsError, mockSettings } from './settings';
import { mockStaff, staffAuthHandlers, staffFromBearer } from './staff';

/**
 * Mock Service Worker handlers (`VITE_USE_MOCKS=true`): every screen works without backends.
 * One `graphql.link()` per backend; add handlers next to the operations you build.
 * Shapes are checked against the generated types, so a contract change breaks the build here.
 */
const walletCore = graphql.link(config.walletCoreUrl);
const ratesService = graphql.link(config.ratesServiceUrl);
const treasuryService = graphql.link(config.treasuryServiceUrl);

const mockHealth = (service: string) => ({
  service,
  version: 'mock',
  client: config.client,
  db: 'UP' as const,
  redis: 'UP' as const,
});

/** The caller, like on the real backend: a staff access token (`Bearer`) or the dev header. */
function callerFrom(
  request: Request,
): { id: string; permissions: string[]; strategy: 'jwt' | 'dev' } | null {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const staff = staffFromBearer(authorization);
    return staff && { ...staff, strategy: 'jwt' };
  }
  const match = /^Dev\s+([^:]+)(?::(.*))?$/i.exec(authorization ?? '');
  if (!match) return null;
  const permissions = (match[2] ?? '').split(',').filter(Boolean);
  return { id: match[1], permissions, strategy: 'dev' };
}

interface GraphQLBody<T> {
  data: T | null;
  errors?: { message: string; extensions: { code: string } }[];
}

function asStaff<T>(request: Request, permission: string, resolve: (userId: string) => T) {
  const fail = (message: string, code: string) =>
    HttpResponse.json<GraphQLBody<T>>({ data: null, errors: [{ message, extensions: { code } }] });
  const user = callerFrom(request);
  if (!user) return fail('Authentication required', 'UNAUTHENTICATED');
  if (!user.permissions.includes(permission))
    return fail(`Missing permission: ${permission}`, 'FORBIDDEN');
  try {
    return HttpResponse.json<GraphQLBody<T>>({ data: resolve(user.id) });
  } catch (error) {
    if (error instanceof MockSettingsError) return fail(error.message, error.code);
    throw error;
  }
}

export const handlers = [
  ...staffAuthHandlers,

  walletCore.query<WalletCoreHealthQuery>('WalletCoreHealth', () =>
    HttpResponse.json({
      data: {
        health: {
          service: 'wallet-core',
          version: 'mock',
          client: config.client,
          db: 'UP',
          redis: 'UP',
        },
      },
    }),
  ),

  walletCore.query<MeQuery>('Me', ({ request }) => {
    const user = callerFrom(request);
    if (!user) {
      return HttpResponse.json({
        data: null,
        errors: [{ message: 'Authentication required', extensions: { code: 'UNAUTHENTICATED' } }],
      });
    }
    // Only staff use the back-office; the dev header has no user type until E1-13.
    return HttpResponse.json({ data: { me: { ...user, kind: 'STAFF' } } });
  }),

  walletCore.query<StaffMembersQuery>('StaffMembers', ({ request }) =>
    asStaff(request, 'bo:staff', () => ({ staffMembers: mockStaff.list() })),
  ),

  walletCore.query<StaffSettingsQuery>('StaffSettings', ({ request }) =>
    asStaff(request, 'bo:settings', () => ({ staffSettings: mockSettings.list() })),
  ),

  walletCore.query<SettingHistoryQuery, SettingHistoryQueryVariables>(
    'SettingHistory',
    ({ request, variables }) =>
      asStaff(request, 'bo:settings', () => ({
        settingHistory: mockSettings.history({
          ...variables,
          beforeId: variables.beforeId == null ? null : String(variables.beforeId),
        }),
      })),
  ),

  walletCore.mutation<UpdateSettingMutation, UpdateSettingMutationVariables>(
    'UpdateSetting',
    ({ request, variables }) =>
      asStaff(request, 'bo:settings:modify', (userId) => ({
        updateSetting: mockSettings.update(variables.key, variables.value, userId),
      })),
  ),

  walletCore.mutation<ResetSettingMutation, ResetSettingMutationVariables>(
    'ResetSetting',
    ({ request, variables }) =>
      asStaff(request, 'bo:settings:modify', (userId) => ({
        resetSetting: mockSettings.reset(variables.key, userId),
      })),
  ),

  ratesService.query<RatesServiceHealthQuery>('RatesServiceHealth', () =>
    HttpResponse.json({ data: { health: mockHealth('rates-service') } }),
  ),

  treasuryService.query<TreasuryServiceHealthQuery>('TreasuryServiceHealth', () =>
    HttpResponse.json({ data: { health: mockHealth('treasury-service') } }),
  ),
];
