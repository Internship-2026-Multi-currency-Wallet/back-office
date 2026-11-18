import { Typography } from '@mui/material';
import { ROLE_LABELS } from './roles';
import { StaffActionDialog, type StaffActionDialogProps } from './StaffActionDialog';
import { type StaffMember, useDeactivateStaffMutation } from './staffApi';

export function DeactivateStaffDialog({
  member,
  ...props
}: StaffActionDialogProps & { member: StaffMember }) {
  const [deactivate] = useDeactivateStaffMutation();
  return (
    <StaffActionDialog
      {...props}
      action="deactivate"
      title="Deactivate staff member"
      confirmLabel="Deactivate"
      pendingLabel="Deactivating…"
      confirmColor="error"
      onConfirm={() => deactivate({ staffId: member.id })}
    >
      <Typography>
        Deactivate <strong>{member.email}</strong> ({ROLE_LABELS[member.role]})?
      </Typography>
      <Typography variant="body2" color="text.secondary">
        They can no longer log in, their sessions end and unused invitation links stop working.
        Access they already have may last up to 15 minutes.
      </Typography>
    </StaffActionDialog>
  );
}
