import { graphql } from '../../gql/wallet-core';

export const staffSettingsQuery = graphql(`
  query StaffSettings {
    staffSettings {
      key
      type
      allowedValues
      public
      value
      defaultValue
      overridden
    }
  }
`);

export const settingHistoryQuery = graphql(`
  query SettingHistory($key: String, $limit: Int!, $before: DateTime, $beforeId: ID) {
    settingHistory(key: $key, limit: $limit, before: $before, beforeId: $beforeId) {
      id
      key
      oldValue
      newValue
      changedBy
      changedAt
    }
  }
`);

export const updateSettingMutation = graphql(`
  mutation UpdateSetting($key: String!, $value: JSON!) {
    updateSetting(key: $key, value: $value) {
      key
      value
      overridden
    }
  }
`);

export const resetSettingMutation = graphql(`
  mutation ResetSetting($key: String!) {
    resetSetting(key: $key) {
      key
      value
      overridden
    }
  }
`);
