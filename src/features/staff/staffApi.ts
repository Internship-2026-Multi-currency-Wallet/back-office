import { api, graphqlQuery } from '../../app/api';
import { request } from '../../graphql/client';
import type { StaffMembersQuery } from '../../gql/wallet-core/graphql';
import { staffMembersQuery } from './staff.wallet-core';

export type StaffMember = StaffMembersQuery['staffMembers'][number];

export const staffApi = api.injectEndpoints({
  endpoints: (build) => ({
    staffMembers: build.query<StaffMember[], void>({
      queryFn: () =>
        graphqlQuery(async () => (await request('walletCore', staffMembersQuery)).staffMembers),
    }),
  }),
});

export const { useStaffMembersQuery } = staffApi;
