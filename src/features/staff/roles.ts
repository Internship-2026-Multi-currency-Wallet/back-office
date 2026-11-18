import type { StaffRole } from '../../gql/wallet-core/graphql';

/** Every wallet-core `StaffRole`: a role added to the contract breaks the build here. */
export const ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: 'Admin',
  COMPLIANCE: 'Compliance',
  FINANCE: 'Finance',
  SUPPORT: 'Support',
};
export const ROLES = Object.keys(ROLE_LABELS) as StaffRole[];
