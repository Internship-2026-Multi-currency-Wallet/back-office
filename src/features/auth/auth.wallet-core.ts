import { graphql } from '../../gql/wallet-core';

export const staffLoginMutation = graphql(`
  mutation StaffLogin($input: StaffLoginInput!) {
    staffLogin(input: $input) {
      accessToken
      accessTokenExpiresAt
      staff {
        id
        email
        role
        permissions
      }
    }
  }
`);

export const staffLogoutMutation = graphql(`
  mutation StaffLogout {
    staffLogout
  }
`);

export const staffMeQuery = graphql(`
  query StaffMe {
    staffMe {
      id
      email
      role
      permissions
    }
  }
`);
