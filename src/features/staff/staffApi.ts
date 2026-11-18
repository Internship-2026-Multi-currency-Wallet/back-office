import { api, graphqlQuery } from '../../app/api';
import { request } from '../../graphql/client';
import type { InviteStaffInput, StaffMembersQuery } from '../../gql/wallet-core/graphql';
import { inviteStaffMutation, staffMembersQuery } from './staff.wallet-core';

export type StaffMember = StaffMembersQuery['staffMembers'][number];

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
  }),
});

export const { useStaffMembersQuery, useInviteStaffMutation } = staffApi;
