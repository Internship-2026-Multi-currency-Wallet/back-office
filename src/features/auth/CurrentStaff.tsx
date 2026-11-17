import { Button, Typography } from '@mui/material';
import { useAppSelector } from '../../app/store';
import { selectStaff } from './authSlice';
import { useLogout } from './useLogout';

/** Header part: the signed-in staff member (email and role from `staffMe`) and Log out. Nothing in dev mode. */
export function CurrentStaff() {
  const staff = useAppSelector(selectStaff);
  const logout = useLogout();
  if (!staff) return null;
  return (
    <>
      <Typography variant="body2" data-testid="current-staff" sx={{ ml: 2, mr: 1 }}>
        {staff.email} · {staff.role}
      </Typography>
      <Button color="inherit" onClick={logout}>
        Log out
      </Button>
    </>
  );
}
