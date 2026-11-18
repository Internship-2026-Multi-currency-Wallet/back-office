import type { GraphQLRequestError } from '../../graphql/client';

export interface InviteError {
  field?: 'email';
  message: string;
}

/** wallet-core `inviteStaff` errors. Texts are ours: the server `message` is for developers. */
export function describeInviteError(error: Partial<GraphQLRequestError>): InviteError {
  switch (error.code) {
    case 'BAD_USER_INPUT':
      return error.extensions?.field === 'email'
        ? { field: 'email', message: 'Enter a valid email address.' }
        : { message: 'Check the entered values and try again.' };
    case 'STAFF_ALREADY_EXISTS':
      return { field: 'email', message: 'A staff member with this email already exists.' };
    case 'FORBIDDEN':
      return { message: 'You do not have permission to invite staff.' };
    case undefined:
      return { message: 'Could not reach the server. Check your connection and try again.' };
    default:
      return { message: 'Something went wrong. Please try again.' };
  }
}
