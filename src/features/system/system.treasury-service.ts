import { graphql } from '../../gql/treasury-service';

export const treasuryServiceHealthQuery = graphql(`
  query TreasuryServiceHealth {
    health {
      service
      version
      db
      redis
    }
  }
`);
