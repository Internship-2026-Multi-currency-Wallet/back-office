import { Typography } from '@mui/material';
import { StaffActionDialog, type StaffActionDialogProps } from './StaffActionDialog';
import { type StaffMember, useResendStaffInvitationMutation } from './staffApi';

/** The new link goes only into the email wallet-core sends; the app never sees or shows it. */
export function ResendInvitationDialog({
  member,
  ...props
}: StaffActionDialogProps & { member: StaffMember }) {
  const [resend] = useResendStaffInvitationMutation();
  return (
    <StaffActionDialog
      {...props}
      action="resend"
      title="Resend invitation"
      confirmLabel="Resend"
      pendingLabel="Resending…"
      onConfirm={() => resend({ staffId: member.id })}
    >
      <Typography>
        Send a new invitation link to <strong>{member.email}</strong>?
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Links sent earlier stop working. The new link is valid for 48 hours.
      </Typography>
    </StaffActionDialog>
  );
}
