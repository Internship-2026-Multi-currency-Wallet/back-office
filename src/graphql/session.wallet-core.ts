import { graphql } from '../gql/wallet-core';

/** In the graphql layer (not in a feature) because `client.ts` runs it for the transport itself. */
export const staffRefreshSessionMutation = graphql(`
  mutation StaffRefreshSession {
    staffRefreshSession {
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
