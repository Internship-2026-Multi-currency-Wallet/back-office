import { useMeQuery } from '../system/systemApi';

/**
 * Permissions of the current staff member, from `me` (wallet-core).
 * In dev mode they come from `VITE_DEV_USER`, e.g. `100:bo:users,bo:users:modify`.
 */
export function usePermissions(): { permissions: string[]; isLoading: boolean } {
  const { data, isLoading } = useMeQuery();
  return { permissions: data?.permissions ?? [], isLoading };
}

export function hasPermissions(granted: string[], required: string | string[]): boolean {
  const list = Array.isArray(required) ? required : [required];
  return list.every((permission) => granted.includes(permission));
}
