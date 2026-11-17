import { useAppSelector } from '../../app/store';
import { selectStaff } from '../auth/authSlice';
import { useMeQuery } from '../system/systemApi';

/**
 * Permissions of the current staff member, as the backend gave them: from the staff session (`staffMe`), or in
 * dev mode (no session, `VITE_DEV_USER`) from `me`. `error` / `retry`: dev mode only, when `me` failed.
 */
export function usePermissions() {
  const staff = useAppSelector(selectStaff);
  const { data, isLoading, isFetching, error, refetch } = useMeQuery(undefined, {
    skip: staff !== null,
  });
  if (staff) return { permissions: staff.permissions, isLoading: false, isFetching: false };
  return {
    permissions: data?.permissions ?? [],
    isLoading,
    isFetching,
    error,
    retry: () => void refetch(),
  };
}

export function hasPermissions(granted: string[], required: string | string[]): boolean {
  const list = Array.isArray(required) ? required : [required];
  return list.every((permission) => granted.includes(permission));
}
