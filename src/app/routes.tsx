import type { RouteObject } from 'react-router';
import { AppLayout } from '../layout/AppLayout';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';

/** Route table. Features add their routes here (shared file — small PRs). */
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'users',
        // Loaded on demand: the DataGrid is large.
        lazy: async () => ({ Component: (await import('../features/users/UsersPage')).UsersPage }),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
