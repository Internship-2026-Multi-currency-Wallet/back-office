/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  mutation StaffLogin($input: StaffLoginInput!) {\n    staffLogin(input: $input) {\n      accessToken\n      accessTokenExpiresAt\n      staff {\n        id\n        email\n        role\n        permissions\n      }\n    }\n  }\n": typeof types.StaffLoginDocument,
    "\n  mutation StaffLogout {\n    staffLogout\n  }\n": typeof types.StaffLogoutDocument,
    "\n  query StaffMe {\n    staffMe {\n      id\n      email\n      role\n      permissions\n    }\n  }\n": typeof types.StaffMeDocument,
    "\n  mutation AcceptStaffInvitation($input: AcceptStaffInvitationInput!) {\n    acceptStaffInvitation(input: $input)\n  }\n": typeof types.AcceptStaffInvitationDocument,
    "\n  query StaffSettings {\n    staffSettings {\n      key\n      type\n      allowedValues\n      public\n      value\n      defaultValue\n      overridden\n    }\n  }\n": typeof types.StaffSettingsDocument,
    "\n  query SettingHistory($key: String, $limit: Int!, $before: DateTime, $beforeId: ID) {\n    settingHistory(key: $key, limit: $limit, before: $before, beforeId: $beforeId) {\n      id\n      key\n      oldValue\n      newValue\n      changedBy\n      changedAt\n    }\n  }\n": typeof types.SettingHistoryDocument,
    "\n  mutation UpdateSetting($key: String!, $value: JSON!) {\n    updateSetting(key: $key, value: $value) {\n      key\n      value\n      overridden\n    }\n  }\n": typeof types.UpdateSettingDocument,
    "\n  mutation ResetSetting($key: String!) {\n    resetSetting(key: $key) {\n      key\n      value\n      overridden\n    }\n  }\n": typeof types.ResetSettingDocument,
    "\n  query StaffMembers {\n    staffMembers {\n      id\n      email\n      role\n      status\n      createdAt\n    }\n  }\n": typeof types.StaffMembersDocument,
    "\n  query WalletCoreHealth {\n    health {\n      service\n      version\n      client\n      db\n      redis\n    }\n  }\n": typeof types.WalletCoreHealthDocument,
    "\n  query Me {\n    me {\n      id\n      kind\n      permissions\n      strategy\n    }\n  }\n": typeof types.MeDocument,
    "\n  mutation StaffRefreshSession {\n    staffRefreshSession {\n      accessToken\n      accessTokenExpiresAt\n      staff {\n        id\n        email\n        role\n        permissions\n      }\n    }\n  }\n": typeof types.StaffRefreshSessionDocument,
};
const documents: Documents = {
    "\n  mutation StaffLogin($input: StaffLoginInput!) {\n    staffLogin(input: $input) {\n      accessToken\n      accessTokenExpiresAt\n      staff {\n        id\n        email\n        role\n        permissions\n      }\n    }\n  }\n": types.StaffLoginDocument,
    "\n  mutation StaffLogout {\n    staffLogout\n  }\n": types.StaffLogoutDocument,
    "\n  query StaffMe {\n    staffMe {\n      id\n      email\n      role\n      permissions\n    }\n  }\n": types.StaffMeDocument,
    "\n  mutation AcceptStaffInvitation($input: AcceptStaffInvitationInput!) {\n    acceptStaffInvitation(input: $input)\n  }\n": types.AcceptStaffInvitationDocument,
    "\n  query StaffSettings {\n    staffSettings {\n      key\n      type\n      allowedValues\n      public\n      value\n      defaultValue\n      overridden\n    }\n  }\n": types.StaffSettingsDocument,
    "\n  query SettingHistory($key: String, $limit: Int!, $before: DateTime, $beforeId: ID) {\n    settingHistory(key: $key, limit: $limit, before: $before, beforeId: $beforeId) {\n      id\n      key\n      oldValue\n      newValue\n      changedBy\n      changedAt\n    }\n  }\n": types.SettingHistoryDocument,
    "\n  mutation UpdateSetting($key: String!, $value: JSON!) {\n    updateSetting(key: $key, value: $value) {\n      key\n      value\n      overridden\n    }\n  }\n": types.UpdateSettingDocument,
    "\n  mutation ResetSetting($key: String!) {\n    resetSetting(key: $key) {\n      key\n      value\n      overridden\n    }\n  }\n": types.ResetSettingDocument,
    "\n  query StaffMembers {\n    staffMembers {\n      id\n      email\n      role\n      status\n      createdAt\n    }\n  }\n": types.StaffMembersDocument,
    "\n  query WalletCoreHealth {\n    health {\n      service\n      version\n      client\n      db\n      redis\n    }\n  }\n": types.WalletCoreHealthDocument,
    "\n  query Me {\n    me {\n      id\n      kind\n      permissions\n      strategy\n    }\n  }\n": types.MeDocument,
    "\n  mutation StaffRefreshSession {\n    staffRefreshSession {\n      accessToken\n      accessTokenExpiresAt\n      staff {\n        id\n        email\n        role\n        permissions\n      }\n    }\n  }\n": types.StaffRefreshSessionDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation StaffLogin($input: StaffLoginInput!) {\n    staffLogin(input: $input) {\n      accessToken\n      accessTokenExpiresAt\n      staff {\n        id\n        email\n        role\n        permissions\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation StaffLogin($input: StaffLoginInput!) {\n    staffLogin(input: $input) {\n      accessToken\n      accessTokenExpiresAt\n      staff {\n        id\n        email\n        role\n        permissions\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation StaffLogout {\n    staffLogout\n  }\n"): (typeof documents)["\n  mutation StaffLogout {\n    staffLogout\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StaffMe {\n    staffMe {\n      id\n      email\n      role\n      permissions\n    }\n  }\n"): (typeof documents)["\n  query StaffMe {\n    staffMe {\n      id\n      email\n      role\n      permissions\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AcceptStaffInvitation($input: AcceptStaffInvitationInput!) {\n    acceptStaffInvitation(input: $input)\n  }\n"): (typeof documents)["\n  mutation AcceptStaffInvitation($input: AcceptStaffInvitationInput!) {\n    acceptStaffInvitation(input: $input)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StaffSettings {\n    staffSettings {\n      key\n      type\n      allowedValues\n      public\n      value\n      defaultValue\n      overridden\n    }\n  }\n"): (typeof documents)["\n  query StaffSettings {\n    staffSettings {\n      key\n      type\n      allowedValues\n      public\n      value\n      defaultValue\n      overridden\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SettingHistory($key: String, $limit: Int!, $before: DateTime, $beforeId: ID) {\n    settingHistory(key: $key, limit: $limit, before: $before, beforeId: $beforeId) {\n      id\n      key\n      oldValue\n      newValue\n      changedBy\n      changedAt\n    }\n  }\n"): (typeof documents)["\n  query SettingHistory($key: String, $limit: Int!, $before: DateTime, $beforeId: ID) {\n    settingHistory(key: $key, limit: $limit, before: $before, beforeId: $beforeId) {\n      id\n      key\n      oldValue\n      newValue\n      changedBy\n      changedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateSetting($key: String!, $value: JSON!) {\n    updateSetting(key: $key, value: $value) {\n      key\n      value\n      overridden\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateSetting($key: String!, $value: JSON!) {\n    updateSetting(key: $key, value: $value) {\n      key\n      value\n      overridden\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ResetSetting($key: String!) {\n    resetSetting(key: $key) {\n      key\n      value\n      overridden\n    }\n  }\n"): (typeof documents)["\n  mutation ResetSetting($key: String!) {\n    resetSetting(key: $key) {\n      key\n      value\n      overridden\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StaffMembers {\n    staffMembers {\n      id\n      email\n      role\n      status\n      createdAt\n    }\n  }\n"): (typeof documents)["\n  query StaffMembers {\n    staffMembers {\n      id\n      email\n      role\n      status\n      createdAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WalletCoreHealth {\n    health {\n      service\n      version\n      client\n      db\n      redis\n    }\n  }\n"): (typeof documents)["\n  query WalletCoreHealth {\n    health {\n      service\n      version\n      client\n      db\n      redis\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Me {\n    me {\n      id\n      kind\n      permissions\n      strategy\n    }\n  }\n"): (typeof documents)["\n  query Me {\n    me {\n      id\n      kind\n      permissions\n      strategy\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation StaffRefreshSession {\n    staffRefreshSession {\n      accessToken\n      accessTokenExpiresAt\n      staff {\n        id\n        email\n        role\n        permissions\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation StaffRefreshSession {\n    staffRefreshSession {\n      accessToken\n      accessTokenExpiresAt\n      staff {\n        id\n        email\n        role\n        permissions\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;