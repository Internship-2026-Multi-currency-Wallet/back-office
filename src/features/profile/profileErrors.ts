import type { GraphQLRequestError } from '../../graphql/client';

export interface PasswordChangeError {
  field?: 'currentPassword' | 'newPassword';
  message: string;
}

/** wallet-core `changeOwnStaffPassword` errors. Our texts only: never the server message, never a password. */
export function describePasswordChangeError(
  error: Partial<GraphQLRequestError>,
): PasswordChangeError {
  switch (error.code) {
    case 'INVALID_CURRENT_PASSWORD':
      return { field: 'currentPassword', message: 'The current password is incorrect.' };
    case 'BAD_USER_INPUT':
      return error.extensions?.field === 'newPassword'
        ? { field: 'newPassword', message: 'The new password does not meet the requirements.' }
        : { message: 'Check the entered values and try again.' };
    case 'UNAUTHENTICATED':
      return { message: 'Your session has ended. Log in again.' };
    case 'FORBIDDEN':
      return { message: 'Your account cannot change its password. It may no longer be active.' };
    case undefined:
      return { message: 'Could not reach the server. Check your connection and try again.' };
    default:
      return { message: 'Something went wrong. Please try again.' };
  }
}
