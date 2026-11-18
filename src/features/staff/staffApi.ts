import { api, graphqlQuery } from '../../app/api';
import type { GraphQLRequestError } from '../../graphql/client';
import { request } from '../../graphql/client';
import type { InviteStaffInput, StaffMembersQuery, StaffRole } from '../../gql/wallet-core/graphql';
import {
  changeStaffRoleMutation,
  deactivateStaffMutation,
  inviteStaffMutation,
  resendStaffInvitationMutation,
  staffMembersQuery,
} from './staff.wallet-core';

export type StaffMember = StaffMembersQuery['staffMembers'][number];

/**
 * These errors mean the shown row is stale (deleted or no longer invited), so the list is reloaded from the
 * server.
 */
const STALE_ROW_CODES = ['STAFF_NOT_FOUND', 'NOT_INVITED'];
const staffChanged = (result: unknown, error: GraphQLRequestError | undefined) =>
  result || STALE_ROW_CODES.includes(error?.code ?? '') ? ['Staff' as const] : [];

export const staffApi = api.enhanceEndpoints({ addTagTypes: ['Staff'] }).injectEndpoints({
  endpoints: (build) => ({
    staffMembers: build.query<StaffMember[], void>({
      queryFn: () =>
        graphqlQuery(async () => (await request('walletCore', staffMembersQuery)).staffMembers),
      providesTags: ['Staff'],
    }),

    inviteStaff: build.mutation<StaffMember, InviteStaffInput>({
      queryFn: (input) =>
        graphqlQuery(
          async () => (await request('walletCore', inviteStaffMutation, { input })).inviteStaff,
        ),
      invalidatesTags: (result) => (result ? ['Staff'] : []),
    }),

    resendStaffInvitation: build.mutation<StaffMember, { staffId: string }>({
      queryFn: (variables) =>
        graphqlQuery(
          async () =>
            (await request('walletCore', resendStaffInvitationMutation, variables))
              .resendStaffInvitation,
        ),
      invalidatesTags: staffChanged,
    }),

    changeStaffRole: build.mutation<StaffMember, { staffId: string; role: StaffRole }>({
      queryFn: (variables) =>
        graphqlQuery(
          async () =>
            (await request('walletCore', changeStaffRoleMutation, variables)).changeStaffRole,
        ),
      invalidatesTags: staffChanged,
    }),

    deactivateStaff: build.mutation<StaffMember, { staffId: string }>({
      queryFn: (variables) =>
        graphqlQuery(
          async () =>
            (await request('walletCore', deactivateStaffMutation, variables)).deactivateStaff,
        ),
      invalidatesTags: staffChanged,
    }),
  }),
});

export const {
  useStaffMembersQuery,
  useInviteStaffMutation,
  useResendStaffInvitationMutation,
  useChangeStaffRoleMutation,
  useDeactivateStaffMutation,
} = staffApi;
