import { Alert, MenuItem, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import type { StaffRole } from '../../gql/wallet-core/graphql';
import { ROLE_LABELS, ROLES } from './roles';
import { StaffActionDialog, type StaffActionDialogProps } from './StaffActionDialog';
import { type StaffMember, useChangeStaffRoleMutation } from './staffApi';

interface ChangeRoleDialogProps extends StaffActionDialogProps {
  member: StaffMember;
  /** The signed-in staff member's own account: they are logged out after the change. */
  isSelf: boolean;
}

export function ChangeRoleDialog({ member, isSelf, ...props }: ChangeRoleDialogProps) {
  const [changeRole, { isLoading }] = useChangeStaffRoleMutation();
  const [role, setRole] = useState<StaffRole>(member.role);
  const changed = role !== member.role;

  return (
    <StaffActionDialog
      {...props}
      action="changeRole"
      title="Change role"
      confirmLabel="Change role"
      pendingLabel="Changing…"
      canConfirm={changed}
      onConfirm={() => changeRole({ staffId: member.id, role })}
    >
      <Typography>
        Role of <strong>{member.email}</strong>, currently {ROLE_LABELS[member.role]}.
      </Typography>
      <TextField
        select
        label="New role"
        value={role}
        onChange={(e) => setRole(e.target.value as StaffRole)}
        disabled={isLoading}
        helperText={changed ? ' ' : 'Select a different role.'}
      >
        {ROLES.map((value) => (
          <MenuItem key={value} value={value}>
            {ROLE_LABELS[value]}
          </MenuItem>
        ))}
      </TextField>
      {isSelf ? (
        <Alert severity="warning">
          This is your own account. After the change you are logged out and log in again with the
          permissions of the new role.
        </Alert>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Their sessions end, so they log in again with the new permissions. Access they already
          have may last up to 15 minutes.
        </Typography>
      )}
    </StaffActionDialog>
  );
}
