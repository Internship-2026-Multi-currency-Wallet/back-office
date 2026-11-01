import type { ReactNode } from 'react';
import { hasPermissions, usePermissions } from './usePermissions';

interface RequirePermissionProps {
  /** One permission or a list (all required), e.g. `bo:users:modify`. */
  permission: string | string[];
  children: ReactNode;
  /** Rendered when the permission is missing. Default: nothing (hide the element). */
  fallback?: ReactNode;
}

/**
 * Permission seam (frontend). Shows `children` only when the current user has the permission.
 * Hiding is for UX only — the backend enforces the same permission with `@RequirePermission`.
 *
 *   <RequirePermission permission="bo:users:modify">
 *     <Button>Block user</Button>
 *   </RequirePermission>
 */
export function RequirePermission({
  permission,
  children,
  fallback = null,
}: RequirePermissionProps) {
  const { permissions, isLoading } = usePermissions();
  if (isLoading) return null;
  return <>{hasPermissions(permissions, permission) ? children : fallback}</>;
}
