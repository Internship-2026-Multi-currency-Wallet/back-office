import type { RouteObject } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { AppLayout } from '../layout/AppLayout';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';

/** Route table. Features add their routes here (shared file — small PRs). */
export const routes: RouteObject[] = [
  { path: 'login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          {
            path: 'users',
            // Loaded on demand: the DataGrid is large.
            lazy: async () => ({
              Component: (await import('../features/users/UsersPage')).UsersPage,
            }),
          },
          {
            path: 'settings',
            lazy: async () => ({
              Component: (await import('../features/settings/SettingsPage')).SettingsPage,
            }),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
