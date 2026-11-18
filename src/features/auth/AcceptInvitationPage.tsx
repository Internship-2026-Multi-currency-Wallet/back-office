import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { type FormEvent, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { type GraphQLRequestError, toRequestError } from '../../graphql/client';
import { acceptStaffInvitation } from './authApi';
import { describeInvitationError } from './authErrors';
import { PasswordRequirements } from './PasswordRequirements';
import { meetsPasswordRules } from './passwordRules';

/** The token is a credential: keep it in memory only, never log or store it. */
export function AcceptInvitationPage() {
  const token = useSearchParams()[0].get('token')?.trim() ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<GraphQLRequestError | null>(null);
  const [accepted, setAccepted] = useState(false);

  const mismatch = confirm !== '' && confirm !== password;
  const canSubmit = !isLoading && meetsPasswordRules(password) && confirm === password;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await acceptStaffInvitation({ token, password });
      setAccepted(true);
    } catch (acceptError) {
      setError(toRequestError(acceptError));
    } finally {
      setLoading(false);
    }
  };
  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    if (error) setError(null);
  };

  const linkProblem = !token
    ? 'This invitation link is incomplete. Open the link from the invitation email again.'
    : error?.code === 'INVALID_INVITATION' ||
        (error?.code === 'BAD_USER_INPUT' && error.extensions?.field === 'token')
      ? describeInvitationError(error)
      : null;

  return (
    <Box
      sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'grey.50', p: 2 }}
    >
      <Paper sx={{ p: 4, width: '100%', maxWidth: 400 }}>
        <Stack spacing={2}>
          <Typography variant="h5" component="h1">
            Accept invitation
          </Typography>
          {accepted ? (
            <>
              <Alert severity="success">
                Your password is set. Log in with your email and the new password.
              </Alert>
              <Button component={RouterLink} to="/login" variant="contained">
                Go to login
              </Button>
            </>
          ) : linkProblem ? (
            <>
              <Alert severity="error">{linkProblem}</Alert>
              <Button component={RouterLink} to="/login">
                Go to login
              </Button>
            </>
          ) : (
            <Box component="form" noValidate aria-label="Set password" onSubmit={onSubmit}>
              <Stack spacing={2}>
                <Typography color="text.secondary">
                  Set a password for your Back-office account.
                </Typography>
                {error && <Alert severity="error">{describeInvitationError(error)}</Alert>}
                <TextField
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => edit(setPassword)(e.target.value)}
                  disabled={isLoading}
                />
                <PasswordRequirements password={password} />
                <TextField
                  label="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => edit(setConfirm)(e.target.value)}
                  disabled={isLoading}
                  error={mismatch}
                  helperText={mismatch ? 'Passwords do not match.' : ' '}
                />
                <Button type="submit" variant="contained" disabled={!canSubmit}>
                  {isLoading ? 'Setting password…' : 'Set password'}
                </Button>
              </Stack>
            </Box>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
