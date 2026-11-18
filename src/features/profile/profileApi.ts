import { request } from '../../graphql/client';
import type { ChangeOwnStaffPasswordInput } from '../../gql/wallet-core/graphql';
import { changeOwnStaffPasswordMutation } from './profile.wallet-core';

/**
 * A plain call, not an RTK Query mutation: RTK keeps a mutation's arguments in the Redux state (and DevTools), and
 * these are plaintext passwords. wallet-core keeps this session and ends the other ones of the staff member.
 */
export async function changeOwnStaffPassword(input: ChangeOwnStaffPasswordInput): Promise<boolean> {
  return (await request('walletCore', changeOwnStaffPasswordMutation, { input }))
    .changeOwnStaffPassword;
}
