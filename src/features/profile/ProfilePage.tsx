import { Alert, Box, Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import { type FormEvent, useRef, useState } from 'react';
import { useAppSelector } from '../../app/store';
import { toRequestError } from '../../graphql/client';
import { selectStaff } from '../auth/authSlice';
import { PasswordRequirements } from '../auth/PasswordRequirements';
import { meetsPasswordRules } from '../auth/passwordRules';
import { ROLE_LABELS } from '../staff/roles';
import { changeOwnStaffPassword } from './profileApi';
import { type PasswordChangeError, describePasswordChangeError } from './profileErrors';

export function ProfilePage() {
  const staff = useAppSelector(selectStaff);

  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <Typography variant="h4" component="h1">
        Profile
      </Typography>
      {staff ? (
        <>
          <Paper sx={{ p: 3 }} component="section" aria-labelledby="profile-account">
            <Stack spacing={1.5}>
              <Typography variant="h6" component="h2" id="profile-account">
                Account
              </Typography>
              <Field label="Email" value={staff.email} />
              <Field label="Role" value={ROLE_LABELS[staff.role] ?? staff.role} />
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Permissions
                </Typography>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {staff.permissions.map((permission) => (
                    <Chip key={permission} size="small" label={permission} />
                  ))}
                </Stack>
              </Box>
            </Stack>
          </Paper>
          <Paper sx={{ p: 3 }} component="section" aria-labelledby="profile-password">
            <Typography variant="h6" component="h2" id="profile-password" sx={{ mb: 2 }}>
              Change password
            </Typography>
            <ChangePasswordForm />
          </Paper>
        </>
      ) : (
        // Dev mode (`VITE_DEV_USER`): there is no staff account behind the dev header.
        <Alert severity="info">Log in as a staff member to see your profile.</Alert>
      )}
    </Stack>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography>{value}</Typography>
    </Box>
  );
}

/** Passwords live only in this component's state: never logged, stored or put into Redux, cleared after success. */
function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<PasswordChangeError | null>(null);
  const [changed, setChanged] = useState(false);
  // `isLoading` changes a render later: a double submit must not send two changes.
  const sending = useRef(false);

  const mismatch = confirm !== '' && confirm !== next;
  const canSubmit = !isLoading && current !== '' && meetsPasswordRules(next) && confirm === next;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || sending.current) return;
    sending.current = true;
    setLoading(true);
    setError(null);
    setChanged(false);
    try {
      await changeOwnStaffPassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setChanged(true);
    } catch (changeError) {
      setError(describePasswordChangeError(toRequestError(changeError)));
    } finally {
      sending.current = false;
      setLoading(false);
    }
  };
  const edit =
    (set: (value: string) => void, field: PasswordChangeError['field']) => (value: string) => {
      set(value);
      setChanged(false);
      setError((shown) => (shown?.field && shown.field !== field ? shown : null));
    };
  const fieldError = (field: PasswordChangeError['field']) =>
    error && error.field === field ? error.message : null;

  return (
    <Box component="form" noValidate aria-label="Change password" onSubmit={onSubmit}>
      <Stack spacing={2}>
        {changed && (
          <Alert severity="success">
            Your password has been changed. You stay logged in here. Other sessions can no longer be
            renewed and end within 15 minutes.
          </Alert>
        )}
        {error && !error.field && <Alert severity="error">{error.message}</Alert>}
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => edit(setCurrent, 'currentPassword')(e.target.value)}
          disabled={isLoading}
          error={fieldError('currentPassword') !== null}
          helperText={fieldError('currentPassword') ?? ' '}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => edit(setNext, 'newPassword')(e.target.value)}
          disabled={isLoading}
          error={fieldError('newPassword') !== null}
          helperText={fieldError('newPassword') ?? ' '}
        />
        <PasswordRequirements password={next} />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => edit(setConfirm, undefined)(e.target.value)}
          disabled={isLoading}
          error={mismatch}
          helperText={mismatch ? 'Passwords do not match.' : ' '}
        />
        <Box>
          <Button type="submit" variant="contained" disabled={!canSubmit}>
            {isLoading ? 'Changing password…' : 'Change password'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
