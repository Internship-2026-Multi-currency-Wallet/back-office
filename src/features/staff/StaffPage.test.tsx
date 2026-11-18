import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { request, toRequestError } from '../../graphql/client';
import type { SessionStaff } from '../../graphql/session';
import { server } from '../../mocks/server';
import { MOCK_INVITATION_TOKEN, MOCK_INVITED_EMAIL } from '../../mocks/staff';
import { ADMIN, countCalls, signInForTest, SUPPORT, walletCore } from '../../test/auth';
import { renderApp } from '../../test/render';
import { acceptStaffInvitation } from '../auth/authApi';
import { staffMembersQuery } from './staff.wallet-core';

/** Roles without `bo:staff`, with their permissions from the wallet-core role table. */
const WITHOUT_STAFF: SessionStaff[] = [
  SUPPORT,
  { ...SUPPORT, role: 'COMPLIANCE', permissions: ['bo'] },
  { ...SUPPORT, role: 'FINANCE', permissions: ['bo', 'bo:settings', 'bo:settings:modify'] },
];

function signInAs(staff: SessionStaff) {
  signInForTest({ staff });
  server.use(walletCore.query('StaffMe', () => HttpResponse.json({ data: { staffMe: staff } })));
}

const staffLink = () => screen.queryByRole('link', { name: 'Staff' });
const grid = () => screen.findByRole('grid', { name: 'Staff members' });

function rowOf(email: string): HTMLElement {
  const row = screen.getByText(email).closest<HTMLElement>('[role="row"]');
  if (!row) throw new Error(`No row for ${email}`);
  return row;
}

describe('staff list access', () => {
  it('shows Staff in the menu for ADMIN and opens the list', async () => {
    signInForTest({ staff: ADMIN });
    const { router } = renderApp('/');

    await userEvent.click(await screen.findByRole('link', { name: 'Staff' }));

    expect(await screen.findByRole('heading', { name: 'Staff' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/staff');
    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
  });

  it.each(WITHOUT_STAFF.map((staff) => [staff.role, staff] as const))(
    '%s sees no Staff item and gets No Access on /staff, without a request and keeping the session',
    async (_role, staff) => {
      signInAs(staff);
      const list = countCalls('StaffMembers');
      server.use(list.handler);
      const { router } = renderApp('/');
      expect(await screen.findByTestId('current-staff')).toHaveTextContent(
        `${staff.email} · ${staff.role}`,
      );
      expect(staffLink()).not.toBeInTheDocument();

      await act(() => router.navigate('/staff'));

      expect(await screen.findByRole('heading', { name: 'No Access' })).toBeInTheDocument();
      expect(screen.getByText(/You need the bo:staff permission\./)).toBeInTheDocument();
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
      expect(screen.getByTestId('current-staff')).toHaveTextContent(staff.email);
      expect(list.counter.calls).toBe(0);
    },
  );
});

describe('staff list', () => {
  beforeEach(() => signInForTest({ staff: ADMIN }));

  it('shows email, role and status of every staff member, without ids', async () => {
    renderApp('/staff');
    await grid();

    expect(await screen.findByText(MOCK_INVITED_EMAIL)).toBeVisible();
    expect(within(rowOf(MOCK_INVITED_EMAIL)).getByText('SUPPORT')).toBeInTheDocument();
    expect(within(rowOf(MOCK_INVITED_EMAIL)).getByText('INVITED')).toBeInTheDocument();
    expect(within(rowOf('admin@example.com')).getByText('ADMIN')).toBeInTheDocument();
    expect(within(rowOf('admin@example.com')).getByText('ACTIVE')).toBeInTheDocument();
    expect(within(rowOf('support@example.com')).getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();
    expect(screen.queryByText('staff-admin')).not.toBeInTheDocument();
  });

  it('shows the same mock staff that accepting an invitation changes', async () => {
    await acceptStaffInvitation({ token: MOCK_INVITATION_TOKEN, password: 'Invited1234!' });
    renderApp('/staff');
    await grid();

    expect(await screen.findByText(MOCK_INVITED_EMAIL)).toBeInTheDocument();
    expect(within(rowOf(MOCK_INVITED_EMAIL)).getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.queryByText('INVITED')).not.toBeInTheDocument();
  });

  it('shows a loading state until the list arrives', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(countCalls('StaffMembers', () => held).handler);
    renderApp('/staff');

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('admin@example.com')).not.toBeInTheDocument();

    release();
    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    server.use(
      walletCore.query('StaffMembers', () => HttpResponse.json({ data: { staffMembers: [] } })),
    );
    renderApp('/staff');

    expect(await screen.findByText('No staff members yet')).toBeInTheDocument();
  });

  it('shows an error with Retry, which loads the list', async () => {
    let calls = 0;
    server.use(
      walletCore.query('StaffMembers', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : undefined;
      }),
    );
    renderApp('/staff');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load staff');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();

    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('shows FORBIDDEN from the server as an error', async () => {
    server.use(
      walletCore.query('StaffMembers', () =>
        HttpResponse.json({
          data: null,
          errors: [{ message: 'Missing permission: bo:staff', extensions: { code: 'FORBIDDEN' } }],
        }),
      ),
    );
    renderApp('/staff');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load staff: Missing permission: bo:staff',
    );
  });
});

describe('mock StaffMembers contract', () => {
  const listStaff = () => request('walletCore', staffMembersQuery);

  it('rejects a SUPPORT token with FORBIDDEN and returns no staff data', async () => {
    signInForTest({ staff: SUPPORT });

    const error = await listStaff().then(
      (data) => ({ data }),
      (error: unknown) => toRequestError(error),
    );

    expect(error).toEqual({ message: 'Missing permission: bo:staff', code: 'FORBIDDEN' });
  });

  it('answers an ADMIN token with the staff list', async () => {
    signInForTest({ staff: ADMIN });

    const { staffMembers } = await listStaff();

    expect(staffMembers.map((member) => member.email)).toContain('support@example.com');
  });
});
