import { api, graphqlQuery } from '../../app/api';
import { request } from '../../graphql/client';
import type { RatesServiceHealthQuery } from '../../gql/rates-service/graphql';
import type { TreasuryServiceHealthQuery } from '../../gql/treasury-service/graphql';
import type { MeQuery, WalletCoreHealthQuery } from '../../gql/wallet-core/graphql';
import { ratesServiceHealthQuery } from './system.rates-service';
import { treasuryServiceHealthQuery } from './system.treasury-service';
import { meQuery, walletCoreHealthQuery } from './system.wallet-core';

export const systemApi = api.injectEndpoints({
  endpoints: (build) => ({
    walletCoreHealth: build.query<WalletCoreHealthQuery['health'], void>({
      queryFn: () =>
        graphqlQuery(async () => (await request('walletCore', walletCoreHealthQuery)).health),
    }),
    ratesServiceHealth: build.query<RatesServiceHealthQuery['health'], void>({
      queryFn: () =>
        graphqlQuery(async () => (await request('ratesService', ratesServiceHealthQuery)).health),
    }),
    treasuryServiceHealth: build.query<TreasuryServiceHealthQuery['health'], void>({
      queryFn: () =>
        graphqlQuery(
          async () => (await request('treasuryService', treasuryServiceHealthQuery)).health,
        ),
    }),
    me: build.query<MeQuery['me'], void>({
      queryFn: () => graphqlQuery(async () => (await request('walletCore', meQuery)).me),
    }),
  }),
});

export const {
  useWalletCoreHealthQuery,
  useRatesServiceHealthQuery,
  useTreasuryServiceHealthQuery,
  useMeQuery,
} = systemApi;
