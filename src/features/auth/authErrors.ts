import type { GraphQLRequestError } from '../../graphql/client';

/**
 * Login errors of wallet-core `staffLogin`. Texts are ours: the server `message` is for developers.
 * A deactivated or not yet activated account answers INVALID_CREDENTIALS on purpose (no account enumeration),
 * so the message mentions it.
 */
export function describeLoginError(error: Partial<GraphQLRequestError>): string {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return 'Invalid email or password, or the account is not active.';
    case 'ACCOUNT_LOCKED': {
      const until = formatTime(error.extensions?.lockedUntil);
      return until
        ? `Too many failed attempts. The account is locked until ${until}.`
        : 'Too many failed attempts. The account is locked. Try again later.';
    }
    case undefined:
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/** Controlled UI text: server messages are for developers. */
export function describeInvitationError(error: Partial<GraphQLRequestError>): string {
  switch (error.code) {
    case 'INVALID_INVITATION':
      return 'This invitation link is invalid, already used or expired. Ask an administrator to send a new one.';
    case 'BAD_USER_INPUT':
      return error.extensions?.field === 'password'
        ? 'The password does not meet the requirements.'
        : 'This invitation link is invalid. Open the link from the invitation email again.';
    case undefined:
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function formatTime(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}
