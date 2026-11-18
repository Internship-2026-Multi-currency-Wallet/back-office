import { Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { useAppSelector } from '../../app/store';
import { RequirePermission } from '../permissions/RequirePermission';
import { PROFILE_PERMISSION } from '../profile/permissions';
import { selectStaff } from './authSlice';
import { useLogout } from './useLogout';

export function CurrentStaff() {
  const staff = useAppSelector(selectStaff);
  const logout = useLogout();
  if (!staff) return null;
  return (
    <>
      <Typography variant="body2" data-testid="current-staff" sx={{ ml: 2, mr: 1 }}>
        {staff.email} · {staff.role}
      </Typography>
      <RequirePermission permission={PROFILE_PERMISSION}>
        <Button color="inherit" component={RouterLink} to="/profile">
          Profile
        </Button>
      </RequirePermission>
      <Button color="inherit" onClick={() => logout()}>
        Log out
      </Button>
    </>
  );
}
