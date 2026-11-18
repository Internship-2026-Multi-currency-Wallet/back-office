import { graphql } from '../../gql/wallet-core';

export const staffMembersQuery = graphql(`
  query StaffMembers {
    staffMembers {
      id
      email
      role
      status
      createdAt
    }
  }
`);

export const inviteStaffMutation = graphql(`
  mutation InviteStaff($input: InviteStaffInput!) {
    inviteStaff(input: $input) {
      id
      email
      role
      status
      createdAt
    }
  }
`);
