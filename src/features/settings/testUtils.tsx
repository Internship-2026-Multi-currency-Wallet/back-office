import { screen, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { graphql } from 'msw/graphql';
import { config } from '../../config-env';
import { server } from '../../mocks/server';
import { mockSettings } from '../../mocks/settings';
import { renderApp } from '../../test/render';

export const walletCore = graphql.link(config.walletCoreUrl);

export function rowOf(name: string): HTMLElement {
  const row = within(screen.getByRole('grid', { hidden: true }))
    .getByText(name)
    .closest<HTMLElement>('[role="row"]');
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

export async function openSettings() {
  const rendered = renderApp('/settings');
  await screen.findByText('Google sign-in');
  return rendered;
}

export const googleSwitch = () => screen.getByRole('switch', { name: 'Google sign-in' });

export const phoneOption = (name: string) =>
  within(rowOf('Phone number required')).getByRole('button', { name });

export const serverSetting = (key: string) => mockSettings.list().find((s) => s.key === key)!;

export const saved = (key: string, value: unknown): Response =>
  HttpResponse.json({ data: { updateSetting: mockSettings.update(key, value, '100') } });

export const rejected = (message = 'Rejected'): Response =>
  HttpResponse.json({
    data: null,
    errors: [{ message, extensions: { code: 'INVALID_VALUE' } }],
  });

export interface HeldCall {
  variables: { key: string; value: unknown };
  release: () => void;
}

export function holdUpdates(
  respond: (variables: HeldCall['variables'], call: number) => Response = (variables) =>
    saved(variables.key, variables.value),
): HeldCall[] {
  const calls: HeldCall[] = [];
  server.use(
    walletCore.mutation('UpdateSetting', async ({ variables }) => {
      const call = calls.length + 1;
      await new Promise<void>((release) =>
        calls.push({ variables: variables as HeldCall['variables'], release }),
      );
      return respond(variables as HeldCall['variables'], call);
    }),
  );
  return calls;
}

export function countFetches(fail?: (fetch: number) => boolean): () => number {
  let fetches = 0;
  server.use(
    walletCore.query('StaffSettings', () => {
      fetches += 1;
      return fail?.(fetches) ? HttpResponse.error() : undefined;
    }),
  );
  return () => fetches;
}
