import { screen } from '@testing-library/react';
import { graphql } from 'msw/graphql';
import { HttpResponse } from 'msw';
import { config } from '../config-env';
import { server } from '../mocks/server';
import { renderApp } from '../test/render';

describe('HomePage', () => {
  it('shows wallet-core health and the dev user (mocks)', async () => {
    renderApp('/');
    expect(await screen.findByTestId('health')).toHaveTextContent(
      'Connected to wallet-core: wallet-core mock (client demo, db UP, redis UP)',
    );
    expect(await screen.findByTestId('me')).toHaveTextContent(
      'Dev user: 100 (permissions: bo:users, bo:users:modify)',
    );
    expect(await screen.findByTestId('status-rates-service')).toHaveTextContent('mock · db UP');
    expect(await screen.findByTestId('status-treasury-service')).toHaveTextContent('mock · db UP');
  });

  it('shows an error when wallet-core is down', async () => {
    server.use(
      graphql
        .link(config.walletCoreUrl)
        .query('WalletCoreHealth', () => HttpResponse.json({}, { status: 503 })),
    );
    renderApp('/');
    expect(await screen.findByText(/wallet-core is not reachable/)).toBeInTheDocument();
  });
});
