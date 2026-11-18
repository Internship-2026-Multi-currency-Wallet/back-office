/**
 * The wallet-core staff password rules (`AcceptStaffInvitationInput.password`, `ChangeOwnStaffPasswordInput.newPassword`,
 * same as user registration). UX only: wallet-core checks them again and is authoritative.
 */
export const PASSWORD_RULES = [
  { label: '8 to 128 characters', test: (p: string) => p.length >= 8 && p.length <= 128 },
  { label: 'An uppercase letter', test: (p: string) => /\p{Lu}/u.test(p) },
  { label: 'A digit', test: (p: string) => /\d/.test(p) },
  { label: 'A special character', test: (p: string) => /[^\p{L}\p{N}]/u.test(p) },
];

export const meetsPasswordRules = (password: string) =>
  PASSWORD_RULES.every((rule) => rule.test(password));
