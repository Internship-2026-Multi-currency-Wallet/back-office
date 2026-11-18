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
