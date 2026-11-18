import { graphql } from '../../gql/wallet-core';

export const staffMembersQuery = graphql(`
  query StaffMembers {
    staffMembers {
      id
      email
      role
      status
      createdAt
    }
  }
`);

export const inviteStaffMutation = graphql(`
  mutation InviteStaff($input: InviteStaffInput!) {
    inviteStaff(input: $input) {
      id
      email
      role
      status
      createdAt
    }
  }
`);

export const resendStaffInvitationMutation = graphql(`
  mutation ResendStaffInvitation($staffId: ID!) {
    resendStaffInvitation(staffId: $staffId) {
      id
      email
      role
      status
      createdAt
    }
  }
`);

export const changeStaffRoleMutation = graphql(`
  mutation ChangeStaffRole($staffId: ID!, $role: StaffRole!) {
    changeStaffRole(staffId: $staffId, role: $role) {
      id
      email
      role
      status
      createdAt
    }
  }
`);

export const deactivateStaffMutation = graphql(`
  mutation DeactivateStaff($staffId: ID!) {
    deactivateStaff(staffId: $staffId) {
      id
      email
      role
      status
      createdAt
    }
  }
`);
