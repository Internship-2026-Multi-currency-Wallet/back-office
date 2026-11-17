import { Box, CircularProgress, Typography } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAppSelector } from '../../app/store';
import { config } from '../../config-env';
import { selectAuthStatus, selectStaff } from './authSlice';

/**
 * Layout route: the nested routes are only for a signed-in staff member. Without a session a configured dev user
 * (`VITE_DEV_USER`, local and staging only) still opens the app, as before.
 */
export function RequireAuth() {
  const status = useAppSelector(selectAuthStatus);
  const staff = useAppSelector(selectStaff);
  const location = useLocation();

  if (status === 'restoring') {
    return (
      <Box
        role="status"
        aria-live="polite"
        sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, py: 8 }}
      >
        <CircularProgress size={24} aria-hidden />
        <Typography>Restoring your session…</Typography>
      </Box>
    );
  }
  // Keyed by staff id: another identity (e.g. a login in another tab) remounts the pages.
  if (staff) return <Outlet key={staff.id} />;
  if (config.devUser) return <Outlet />;
  return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}
