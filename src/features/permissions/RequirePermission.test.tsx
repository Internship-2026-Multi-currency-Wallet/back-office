import { render, screen } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { graphql } from 'msw/graphql';
import { AppProviders } from '../../app/AppProviders';
import { createStore } from '../../app/store';
import { config } from '../../config-env';
import { server } from '../../mocks/server';
import { RequirePermission } from './RequirePermission';
import { hasPermissions } from './usePermissions';

function renderWithPermissions(permissions: string[]) {
  server.use(
    graphql
      .link(config.walletCoreUrl)
      .query('Me', () =>
        HttpResponse.json({ data: { me: { id: '100', permissions, strategy: 'dev' } } }),
      ),
  );
  render(
    <AppProviders store={createStore()}>
      <RequirePermission permission="bo:users:modify" fallback={<span>read only</span>}>
        <button>Block user</button>
      </RequirePermission>
    </AppProviders>,
  );
}

describe('RequirePermission', () => {
  it('renders children when the user has the permission', async () => {
    renderWithPermissions(['bo:users', 'bo:users:modify']);
    expect(await screen.findByRole('button', { name: 'Block user' })).toBeInTheDocument();
  });

  it('renders the fallback when the permission is missing', async () => {
    renderWithPermissions(['bo:users']);
    expect(await screen.findByText('read only')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('hasPermissions', () => {
  it('requires all listed permissions', () => {
    expect(hasPermissions(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(hasPermissions(['a'], ['a', 'b'])).toBe(false);
    expect(hasPermissions(['a'], 'a')).toBe(true);
  });
});
