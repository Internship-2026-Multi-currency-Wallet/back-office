import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { type FormEvent, useRef, useState } from 'react';
import type { StaffRole } from '../../gql/wallet-core/graphql';
import { type InviteError, describeInviteError } from './staffErrors';
import { type StaffMember, useInviteStaffMutation } from './staffApi';

/** Every wallet-core `StaffRole`: a role added to the contract breaks the build here. */
const ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: 'Admin',
  COMPLIANCE: 'Compliance',
  FINANCE: 'Finance',
  SUPPORT: 'Support',
};
const ROLES = Object.keys(ROLE_LABELS) as StaffRole[];

// UX only: wallet-core validates the email again and is authoritative.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 255;

function emailProblem(email: string): string | null {
  if (!email) return 'Email is required.';
  if (email.length > EMAIL_MAX_LENGTH) return 'Email must be at most 255 characters.';
  if (!EMAIL.test(email)) return 'Enter a valid email address.';
  return null;
}

interface InviteStaffDialogProps {
  open: boolean;
  onClose: () => void;
  onInvited: (member: StaffMember) => void;
}

/** The form is unmounted while the dialog is closed, so every opening starts empty. */
export function InviteStaffDialog({ open, onClose, onInvited }: InviteStaffDialogProps) {
  const [inviteStaff, { isLoading }] = useInviteStaffMutation();
  return (
    <Dialog
      open={open}
      // No closing by backdrop or Escape while the invitation is being sent.
      onClose={() => !isLoading && onClose()}
      fullWidth
      maxWidth="xs"
      aria-labelledby="invite-staff-title"
    >
      <DialogTitle id="invite-staff-title">Invite staff</DialogTitle>
      <InviteStaffForm
        invite={inviteStaff}
        isLoading={isLoading}
        onCancel={onClose}
        onInvited={onInvited}
      />
    </Dialog>
  );
}

interface InviteStaffFormProps {
  invite: ReturnType<typeof useInviteStaffMutation>[0];
  isLoading: boolean;
  onCancel: () => void;
  onInvited: (member: StaffMember) => void;
}

function InviteStaffForm({ invite, isLoading, onCancel, onInvited }: InviteStaffFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole | ''>('');
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<InviteError | null>(null);
  // `isLoading` changes a render later: a double click must not send two invitations.
  const sending = useRef(false);

  const trimmedEmail = email.trim();
  const emailError = submitted ? emailProblem(trimmedEmail) : null;
  const roleError = submitted && !role ? 'Select a role.' : null;
  const emailMessage = emailError ?? (serverError?.field === 'email' ? serverError.message : null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending.current) return;
    setSubmitted(true);
    if (emailProblem(trimmedEmail) || !role) return;
    sending.current = true;
    setServerError(null);
    const result = await invite({ email: trimmedEmail, role });
    sending.current = false;
    if (result.data) onInvited(result.data);
    else setServerError(describeInviteError(result.error ?? {}));
  };

  /** An edit clears the general error and the error of the edited field (a role change keeps a duplicate email). */
  const edit = (field?: InviteError['field']) =>
    setServerError((current) => (current?.field && current.field !== field ? current : null));

  return (
    <Box component="form" noValidate aria-label="Invite staff" onSubmit={onSubmit}>
      <DialogContent sx={{ pt: 0 }}>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {serverError && !serverError.field && (
            <Alert severity="error">{serverError.message}</Alert>
          )}
          <TextField
            label="Email"
            type="email"
            autoComplete="off"
            required
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              edit('email');
            }}
            disabled={isLoading}
            error={emailMessage !== null}
            helperText={emailMessage ?? ' '}
          />
          <TextField
            select
            label="Role"
            required
            value={role}
            onChange={(e) => {
              setRole(e.target.value as StaffRole);
              edit();
            }}
            disabled={isLoading}
            error={roleError !== null}
            helperText={roleError ?? ' '}
          >
            {ROLES.map((value) => (
              <MenuItem key={value} value={value}>
                {ROLE_LABELS[value]}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={isLoading}>
          {isLoading ? 'Inviting…' : 'Invite'}
        </Button>
      </DialogActions>
    </Box>
  );
}
