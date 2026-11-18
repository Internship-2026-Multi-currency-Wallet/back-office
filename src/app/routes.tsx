import type { RouteObject } from 'react-router';
import { AcceptInvitationPage } from '../features/auth/AcceptInvitationPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { RequireRoutePermission } from '../features/permissions/NoAccessPage';
import { PROFILE_PERMISSION } from '../features/profile/permissions';
import { SETTINGS_PERMISSIONS } from '../features/settings/permissions';
import { STAFF_PERMISSION } from '../features/staff/permissions';
import { AppLayout } from '../layout/AppLayout';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';

/** Route table. Features add their routes here (shared file — small PRs). */
export const routes: RouteObject[] = [
  { path: 'login', element: <LoginPage /> },
  { path: 'accept-invitation', element: <AcceptInvitationPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          {
            // Without the permission: the No Access page instead (the page is not mounted).
            element: <RequireRoutePermission permission="bo:users" />,
            children: [
              {
                path: 'users',
                // Loaded on demand: the DataGrid is large.
                lazy: async () => ({
                  Component: (await import('../features/users/UsersPage')).UsersPage,
                }),
              },
            ],
          },
          {
            element: <RequireRoutePermission permission={SETTINGS_PERMISSIONS} />,
            children: [
              {
                path: 'settings',
                lazy: async () => ({
                  Component: (await import('../features/settings/SettingsPage')).SettingsPage,
                }),
              },
            ],
          },
          {
            element: <RequireRoutePermission permission={STAFF_PERMISSION} />,
            children: [
              {
                path: 'staff',
                lazy: async () => ({
                  Component: (await import('../features/staff/StaffPage')).StaffPage,
                }),
              },
            ],
          },
          {
            element: <RequireRoutePermission permission={PROFILE_PERMISSION} />,
            children: [
              {
                path: 'profile',
                lazy: async () => ({
                  Component: (await import('../features/profile/ProfilePage')).ProfilePage,
                }),
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
