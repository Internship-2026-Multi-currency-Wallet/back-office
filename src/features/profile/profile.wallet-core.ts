import { graphql } from '../../gql/wallet-core';

export const changeOwnStaffPasswordMutation = graphql(`
  mutation ChangeOwnStaffPassword($input: ChangeOwnStaffPasswordInput!) {
    changeOwnStaffPassword(input: $input)
  }
`);
