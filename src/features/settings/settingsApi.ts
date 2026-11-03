import { api, graphqlQuery } from '../../app/api';
import { request } from '../../graphql/client';
import type {
  ResetSettingMutation,
  SettingHistoryQuery,
  StaffSettingsQuery,
  UpdateSettingMutation,
} from '../../gql/wallet-core/graphql';
import {
  resetSettingMutation,
  settingHistoryQuery,
  staffSettingsQuery,
  updateSettingMutation,
} from './settings.wallet-core';

export type StaffSetting = StaffSettingsQuery['staffSettings'][number];
export type SettingChange = SettingHistoryQuery['settingHistory'][number];

interface HistoryCursor {
  before?: string;
  beforeId?: string;
}

export const HISTORY_PAGE_SIZE = 20;

const ALL = '*';

const historyOf = (key: string) => [
  { type: 'SettingHistory' as const, id: key },
  { type: 'SettingHistory' as const, id: ALL },
];

export const settingsApi = api
  .enhanceEndpoints({ addTagTypes: ['Setting', 'SettingHistory'] })
  .injectEndpoints({
    endpoints: (build) => ({
      staffSettings: build.query<StaffSetting[], void>({
        queryFn: () =>
          graphqlQuery(async () => (await request('walletCore', staffSettingsQuery)).staffSettings),
        providesTags: ['Setting'],
      }),

      settingHistory: build.infiniteQuery<SettingChange[], string | undefined, HistoryCursor>({
        infiniteQueryOptions: {
          initialPageParam: {},
          getNextPageParam: (lastPage) => {
            const last = lastPage.at(-1);
            if (!last || lastPage.length < HISTORY_PAGE_SIZE) return undefined;
            return { before: last.changedAt, beforeId: last.id };
          },
        },
        queryFn: ({ queryArg: key, pageParam }) =>
          graphqlQuery(
            async () =>
              (
                await request('walletCore', settingHistoryQuery, {
                  key,
                  limit: HISTORY_PAGE_SIZE,
                  ...pageParam,
                })
              ).settingHistory,
          ),
        providesTags: (_result, _error, key) => [{ type: 'SettingHistory', id: key ?? ALL }],
      }),

      updateSetting: build.mutation<
        UpdateSettingMutation['updateSetting'],
        { key: string; value: unknown }
      >({
        queryFn: (variables) =>
          graphqlQuery(
            async () =>
              (await request('walletCore', updateSettingMutation, variables)).updateSetting,
          ),
        invalidatesTags: (_result, _error, { key }) => ['Setting', ...historyOf(key)],
      }),

      resetSetting: build.mutation<ResetSettingMutation['resetSetting'], string>({
        queryFn: (key) =>
          graphqlQuery(
            async () => (await request('walletCore', resetSettingMutation, { key })).resetSetting,
          ),
        invalidatesTags: (_result, _error, key) => ['Setting', ...historyOf(key)],
      }),
    }),
  });

export const {
  useStaffSettingsQuery,
  useSettingHistoryInfiniteQuery,
  useUpdateSettingMutation,
  useResetSettingMutation,
} = settingsApi;
