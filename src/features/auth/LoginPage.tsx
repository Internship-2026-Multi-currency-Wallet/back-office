import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { type FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAppSelector } from '../../app/store';
import { type GraphQLRequestError, toRequestError } from '../../graphql/client';
import { staffLogin } from './authApi';
import { describeLoginError } from './authErrors';
import { selectStaff } from './authSlice';

export function LoginPage() {
  const staff = useAppSelector(selectStaff);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<GraphQLRequestError | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const state = useLocation().state as { from?: string; notice?: string } | null;
  const from = state?.from ?? '/';

  // A successful login stores the session, the store sets the staff member, and this navigates back.
  if (staff) return <Navigate to={from} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isLoading) return;
    setLoading(true);
    setError(null);
    try {
      await staffLogin({ email: email.trim(), password });
    } catch (loginError) {
      setError(toRequestError(loginError));
    } finally {
      setLoading(false);
    }
  };
  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    if (error) setError(null);
  };

  return (
    <Box
      sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'grey.50', p: 2 }}
    >
      <Paper sx={{ p: 4, width: '100%', maxWidth: 400 }}>
        <Box component="form" noValidate aria-label="Log in" onSubmit={onSubmit}>
          <Stack spacing={2}>
            <Typography variant="h5" component="h1">
              Log in to Back-office
            </Typography>
            {error ? (
              <Alert severity="error">{describeLoginError(error)}</Alert>
            ) : (
              state?.notice && <Alert severity="info">{state.notice}</Alert>
            )}
            <TextField
              label="Email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => edit(setEmail)(e.target.value)}
              disabled={isLoading}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => edit(setPassword)(e.target.value)}
              disabled={isLoading}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={isLoading || !email.trim() || !password}
            >
              {isLoading ? 'Logging in…' : 'Log in'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
