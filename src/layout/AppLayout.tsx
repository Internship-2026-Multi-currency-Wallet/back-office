import { AppBar, Box, Button, Chip, Container, Toolbar, Typography } from '@mui/material';
import { Link as RouterLink, Outlet } from 'react-router';
import { config } from '../config-env';
import { RequirePermission } from '../features/permissions/RequirePermission';
import { SETTINGS_PERMISSIONS } from '../features/settings/permissions';

export function AppLayout() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      <AppBar position="static">
        <Toolbar sx={{ flexWrap: 'wrap', rowGap: 0.5, py: { xs: 1, sm: 0 } }}>
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            Wallet Back-office
          </Typography>
          {config.useMocks && (
            <Chip
              label="mocks"
              size="small"
              sx={{ mr: 1, bgcolor: 'warning.light', color: 'common.black' }}
            />
          )}
          <Chip label={`client: ${config.client}`} size="small" sx={{ mr: 2, color: 'inherit' }} />
          <Button color="inherit" component={RouterLink} to="/">
            Home
          </Button>
          <RequirePermission permission="bo:users">
            <Button color="inherit" component={RouterLink} to="/users">
              Users
            </Button>
          </RequirePermission>
          <RequirePermission permission={SETTINGS_PERMISSIONS}>
            <Button color="inherit" component={RouterLink} to="/settings">
              Settings
            </Button>
          </RequirePermission>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
