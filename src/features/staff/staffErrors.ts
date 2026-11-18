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

export type StaffAction = 'resend' | 'changeRole' | 'deactivate';

const FORBIDDEN_TEXT: Record<StaffAction, string> = {
  resend: 'You do not have permission to resend invitations.',
  changeRole: 'You do not have permission to change staff roles.',
  deactivate: 'You do not have permission to deactivate staff.',
};

/** Errors of `resendStaffInvitation`, `changeStaffRole` and `deactivateStaff`; never the server `message`. */
export function describeStaffActionError(
  action: StaffAction,
  error: Partial<GraphQLRequestError>,
): string {
  switch (error.code) {
    case 'STAFF_NOT_FOUND':
      return 'This staff account no longer exists. The list has been refreshed.';
    case 'NOT_INVITED':
      return 'This account is no longer waiting for an invitation (it was accepted or deactivated). The list has been refreshed.';
    case 'LAST_ADMIN':
      return action === 'deactivate'
        ? 'The last active admin cannot be deactivated. Make another staff member an admin first.'
        : 'The last active admin cannot be demoted. Make another staff member an admin first.';
    case 'CANNOT_DEACTIVATE_SELF':
      return 'You cannot deactivate your own account.';
    case 'FORBIDDEN':
      return FORBIDDEN_TEXT[action];
    case 'UNAUTHENTICATED':
      return 'Your session has ended. Log in again.';
    case undefined:
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
