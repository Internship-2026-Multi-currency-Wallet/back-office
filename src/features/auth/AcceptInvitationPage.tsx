import {
  Alert,
  Box,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type FormEvent, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { type GraphQLRequestError, toRequestError } from '../../graphql/client';
import { acceptStaffInvitation } from './authApi';
import { describeInvitationError } from './authErrors';

/** The wallet-core password rules (`AcceptStaffInvitationInput.password`, same as user registration). */
const PASSWORD_RULES = [
  { label: '8 to 128 characters', test: (p: string) => p.length >= 8 && p.length <= 128 },
  { label: 'An uppercase letter', test: (p: string) => /\p{Lu}/u.test(p) },
  { label: 'A digit', test: (p: string) => /\d/.test(p) },
  { label: 'A special character', test: (p: string) => /[^\p{L}\p{N}]/u.test(p) },
];

/**
 * Public page of the invitation link (`/accept-invitation?token=…`): the invited staff member sets a password.
 * The token stays in the URL and in memory only: never logged or stored. Accepting does not log in.
 */
export function AcceptInvitationPage() {
  const token = useSearchParams()[0].get('token')?.trim() ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<GraphQLRequestError | null>(null);
  const [accepted, setAccepted] = useState(false);

  const rules = PASSWORD_RULES.map((rule) => ({ label: rule.label, met: rule.test(password) }));
  const mismatch = confirm !== '' && confirm !== password;
  const canSubmit = !isLoading && rules.every((rule) => rule.met) && confirm === password;

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

  // An unusable link: nothing to submit, the form would only fail again.
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
                <List dense disablePadding aria-label="Password requirements">
                  {rules.map((rule) => (
                    <ListItem key={rule.label} disableGutters sx={{ py: 0 }}>
                      <ListItemIcon
                        sx={{ minWidth: 24, color: rule.met ? 'success.main' : 'text.disabled' }}
                      >
                        {rule.met ? '✓' : '•'}
                      </ListItemIcon>
                      <ListItemText
                        primary={rule.label}
                        slotProps={{
                          primary: { color: rule.met ? 'success.main' : 'text.secondary' },
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
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
