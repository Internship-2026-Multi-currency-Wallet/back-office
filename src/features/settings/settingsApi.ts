import { api, graphqlQuery } from '../../app/api';
import type { AppDispatch } from '../../app/store';
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
        onQueryStarted: ({ key, value }, { dispatch, queryFulfilled }): Promise<void> =>
          patchSetting(dispatch, queryFulfilled, key, () => ({ value, overridden: true })),
        invalidatesTags: (_result, _error, { key }) => historyOf(key),
      }),

      resetSetting: build.mutation<ResetSettingMutation['resetSetting'], string>({
        queryFn: (key) =>
          graphqlQuery(
            async () => (await request('walletCore', resetSettingMutation, { key })).resetSetting,
          ),
        onQueryStarted: (key, { dispatch, queryFulfilled }): Promise<void> =>
          patchSetting(dispatch, queryFulfilled, key, (row) => ({
            value: JSON.parse(JSON.stringify(row.defaultValue)),
            overridden: false,
          })),
        invalidatesTags: (_result, _error, key) => historyOf(key),
      }),
    }),
  });

export const {
  useStaffSettingsQuery,
  useSettingHistoryInfiniteQuery,
  useUpdateSettingMutation,
  useResetSettingMutation,
} = settingsApi;

type SettingPatch = Pick<StaffSetting, 'value' | 'overridden'>;

async function patchSetting(
  dispatch: AppDispatch,
  queryFulfilled: Promise<{ data: SettingPatch }>,
  key: string,
  optimistic: (row: StaffSetting) => SettingPatch,
): Promise<void> {
  const writeRow = (patch: (row: StaffSetting) => SettingPatch) =>
    dispatch(
      settingsApi.util.updateQueryData('staffSettings', undefined, (rows) => {
        const row = rows.find((setting) => setting.key === key);
        if (row) Object.assign(row, patch(row));
      }),
    );
  const guess = writeRow(optimistic);
  try {
    const { data } = await queryFulfilled;
    writeRow(() => ({ value: data.value, overridden: data.overridden }));
  } catch {
    guess.undo();
  }
}
