import { Alert, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink, Outlet } from 'react-router';
import { RequirePermission } from './RequirePermission';
import { usePermissions } from './usePermissions';

interface PermissionProps {
  /** One permission or a list (all required). */
  permission: string | string[];
}

/**
 * Layout route: renders the nested route only with the permission, otherwise the No Access page. The protected
 * page is never mounted, so it starts no requests. The session stays as it is.
 *
 *   { element: <RequireRoutePermission permission="bo:users" />, children: [{ path: 'users', ... }] }
 */
export function RequireRoutePermission({ permission }: PermissionProps) {
  return (
    <RequirePermission permission={permission} fallback={<NoAccessPage permission={permission} />}>
      <Outlet />
    </RequirePermission>
  );
}

/** Shown instead of a page the current staff member has no permission for. */
export function NoAccessPage({ permission }: PermissionProps) {
  const { permissions, error, isFetching, retry } = usePermissions();
  const missing = (Array.isArray(permission) ? permission : [permission]).filter(
    (required) => !permissions.includes(required),
  );

  let reason;
  if (error?.code === 'UNAUTHENTICATED') {
    // Dev mode only: a staff session has its permissions without a request.
    reason = (
      <Alert severity="error">
        Not signed in (UNAUTHENTICATED). Check VITE_DEV_USER and that wallet-core runs with
        DEV_AUTH=true.
      </Alert>
    );
  } else if (error) {
    reason = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={retry} disabled={isFetching}>
            Retry
          </Button>
        }
      >
        Could not load your profile: {error.message}
      </Alert>
    );
  } else {
    reason = (
      <Typography color="text.secondary">
        You do not have permission to open this page. You need the {missing.join(' and ')}{' '}
        {missing.length > 1 ? 'permissions' : 'permission'}.
      </Typography>
    );
  }

  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="h4" component="h1">
        {error ? 'Could not check access' : 'No Access'}
      </Typography>
      {reason}
      <Button variant="contained" component={RouterLink} to="/">
        Go home
      </Button>
    </Stack>
  );
}
