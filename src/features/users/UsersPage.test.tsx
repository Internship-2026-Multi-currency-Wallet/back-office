import { screen } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { graphql } from 'msw/graphql';
import { config } from '../../config-env';
import { server } from '../../mocks/server';
import { renderApp } from '../../test/render';

describe('UsersPage', () => {
  it('lists demo users in a DataGrid and shows modify actions', async () => {
    renderApp('/users');
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(await screen.findByRole('grid')).toBeInTheDocument();
    expect(screen.getByText('olena@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add user' })).toBeInTheDocument();
  });

  it('hides the page without bo:users', async () => {
    server.use(
      graphql
        .link(config.walletCoreUrl)
        .query('Me', () =>
          HttpResponse.json({ data: { me: { id: '9', permissions: [], strategy: 'dev' } } }),
        ),
    );
    renderApp('/users');
    expect(await screen.findByText(/You need the bo:users permission/)).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});
