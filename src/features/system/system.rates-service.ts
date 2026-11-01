import { graphql } from '../../gql/rates-service';

export const ratesServiceHealthQuery = graphql(`
  query RatesServiceHealth {
    health {
      service
      version
      db
      redis
    }
  }
`);
