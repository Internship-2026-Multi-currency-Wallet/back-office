import { request } from '../../graphql/client';
import type { ChangeOwnStaffPasswordInput } from '../../gql/wallet-core/graphql';
import { changeOwnStaffPasswordMutation } from './profile.wallet-core';

/** Use a plain request because RTK Query retains plaintext mutation arguments in Redux and DevTools. */
export async function changeOwnStaffPassword(input: ChangeOwnStaffPasswordInput): Promise<boolean> {
  return (await request('walletCore', changeOwnStaffPasswordMutation, { input }))
    .changeOwnStaffPassword;
}
