import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type { SessionStaff } from '../../graphql/session';
import { loadSession } from '../../graphql/session';
import { server } from '../../mocks/server';
import { MOCK_INVITATION_TOKEN, MOCK_INVITED_EMAIL, mockStaff } from '../../mocks/staff';
import { ADMIN, countCalls, signInForTest, walletCore } from '../../test/auth';
import { renderApp } from '../../test/render';
import { acceptStaffInvitation } from '../auth/authApi';

// Without a staff session the requests carry this dev user: it may list staff but not modify it.
vi.mock('../../config-env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config-env')>();
  return { ...actual, config: { ...actual.config, devUser: '100:bo,bo:staff' } };
});

const SUPPORT_EMAIL = 'support@example.com';

function rowOf(email: string): HTMLElement {
  // The grid is aria-hidden while a dialog is open; the dialog names the email too.
  const row = within(screen.getByRole('grid', { hidden: true }))
    .getByText(email)
    .closest<HTMLElement>('[role="row"]');
  if (!row) throw new Error(`No row for ${email}`);
  return row;
}

const statusOf = (email: string) =>
  within(rowOf(email)).getByText(/^(ACTIVE|INVITED|DEACTIVATED)$/);
const roleOf = (email: string) =>
  within(rowOf(email)).getByText(/^(ADMIN|SUPPORT|FINANCE|COMPLIANCE)$/);
const actionsButton = (email: string) =>
  within(rowOf(email)).queryByRole('button', { name: `Actions for ${email}` });
const dialog = (name: string) => screen.getByRole('dialog', { name });

async function openStaff() {
  const rendered = renderApp('/staff');
  await screen.findByText(MOCK_INVITED_EMAIL);
  return rendered;
}

async function menuItems(email: string) {
  await userEvent.click(actionsButton(email)!);
  const items = within(await screen.findByRole('menu')).getAllByRole('menuitem');
  return items.map((item) => item.textContent);
}

async function choose(email: string, action: string, dialogName = action) {
  await userEvent.click(actionsButton(email)!);
  await userEvent.click(await screen.findByRole('menuitem', { name: action }));
  return dialog(dialogName);
}

/** Holds the operation until `release()`, then the default mock answers. */
function held(operation: string) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const calls = countCalls(operation, () => gate);
  server.use(calls.handler);
  return { calls: calls.counter, release };
}

const failWith = (operation: string, code: string, message = 'Server detail 1234') =>
  walletCore.mutation(operation, () =>
    HttpResponse.json({ data: null, errors: [{ message, extensions: { code } }] }),
  );

/** Counts StaffMembers requests (the default mock still answers). */
function countList() {
  const list = countCalls('StaffMembers');
  server.use(list.handler);
  return list.counter;
}

/** Exactly `expected` list refetches since `before`; also waits long enough for an unwanted one to start. */
async function expectRefetches(list: { calls: number }, before: number, expected: number) {
  await waitFor(() => expect(list.calls).toBe(before + expected));
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(list.calls).toBe(before + expected);
}

/** A second ACTIVE admin, created like in the app: invited, then accepted. */
async function secondAdmin(): Promise<SessionStaff> {
  const { id } = mockStaff.invite('second.admin@example.com', 'ADMIN');
  await acceptStaffInvitation({ token: 'mock-invitation-1', password: 'Strong1234!' });
  return { ...ADMIN, id, email: 'second.admin@example.com' };
}

describe('staff actions access', () => {
  it('ADMIN gets the actions that fit each row: none for oneself to deactivate', async () => {
    signInForTest({ staff: ADMIN });
    await openStaff();

    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(await menuItems(MOCK_INVITED_EMAIL)).toEqual([
      'Resend invitation',
      'Change role',
      'Deactivate',
    ]);
    await userEvent.keyboard('{Escape}');
    expect(await menuItems(SUPPORT_EMAIL)).toEqual(['Change role', 'Deactivate']);
    await userEvent.keyboard('{Escape}');
    expect(await menuItems('admin@example.com')).toEqual(['Change role']);
  });

  it('a deactivated account has no actions', async () => {
    mockStaff.deactivate('staff-admin', 'staff-support');
    signInForTest({ staff: ADMIN });
    await openStaff();

    expect(statusOf(SUPPORT_EMAIL)).toHaveTextContent('DEACTIVATED');
    expect(actionsButton(SUPPORT_EMAIL)).not.toBeInTheDocument();
  });

  it('a caller with bo:staff but without bo:staff:modify sees the list without actions', async () => {
    await openStaff();

    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
  });
});

describe('resend invitation', () => {
  beforeEach(() => signInForTest({ staff: ADMIN }));

  it('asks first; Cancel sends nothing', async () => {
    const calls = countCalls('ResendStaffInvitation');
    server.use(calls.handler);
    await openStaff();

    const confirm = await choose(MOCK_INVITED_EMAIL, 'Resend invitation');
    expect(confirm).toHaveTextContent(`Send a new invitation link to ${MOCK_INVITED_EMAIL}?`);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.counter.calls).toBe(0);
  });

  it('issues a new link once, refreshes the list and never shows the token', async () => {
    const { calls, release } = held('ResendStaffInvitation');
    const list = countCalls('StaffMembers');
    server.use(list.handler);
    await openStaff();
    const before = list.counter.calls;

    const confirm = await choose(MOCK_INVITED_EMAIL, 'Resend invitation');
    const button = within(confirm).getByRole('button', { name: 'Resend' });
    await userEvent.dblClick(button);
    expect(await within(confirm).findByRole('button', { name: 'Resending…' })).toBeDisabled();
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    release();

    expect(
      await screen.findByText(`New invitation link issued for ${MOCK_INVITED_EMAIL}`),
    ).toBeInTheDocument();
    expect(calls.calls).toBe(1);
    await waitFor(() => expect(list.counter.calls).toBe(before + 1));
    expect(screen.getByText(/New invitation link issued/)).not.toHaveTextContent(/sent|delivered/i);
    expect(document.body).not.toHaveTextContent(/mock-invitation/);
    // The old link no longer works, the new one does.
    await expect(
      acceptStaffInvitation({ token: MOCK_INVITATION_TOKEN, password: 'Strong1234!' }),
    ).rejects.toThrow();
    await expect(
      acceptStaffInvitation({ token: 'mock-invitation-1', password: 'Strong1234!' }),
    ).resolves.toBe(true);
  });

  it('shows NOT_INVITED in our words and refreshes the stale list', async () => {
    // Accepted meanwhile (e.g. in another tab): the list still shows INVITED.
    const list = countList();
    await openStaff();
    const before = list.calls;
    await acceptStaffInvitation({ token: MOCK_INVITATION_TOKEN, password: 'Strong1234!' });

    const confirm = await choose(MOCK_INVITED_EMAIL, 'Resend invitation');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Resend' }));

    expect(
      await within(confirm).findByText('This account is no longer waiting for an invitation', {
        exact: false,
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(statusOf(MOCK_INVITED_EMAIL)).toHaveTextContent('ACTIVE'));
    await expectRefetches(list, before, 1);
  });

  it.each([
    ['STAFF_NOT_FOUND', 'This staff account no longer exists.', 1],
    ['FORBIDDEN', 'You do not have permission to resend invitations.', 0],
    ['INTERNAL_SERVER_ERROR', 'Something went wrong. Please try again.', 0],
  ])(
    'shows %s without the server message, refetching the list only when it is stale',
    async (code, text, refetches) => {
      server.use(failWith('ResendStaffInvitation', code));
      const list = countList();
      await openStaff();
      const before = list.calls;

      const confirm = await choose(MOCK_INVITED_EMAIL, 'Resend invitation');
      await userEvent.click(within(confirm).getByRole('button', { name: 'Resend' }));

      expect(await within(confirm).findByText(text, { exact: false })).toBeInTheDocument();
      expect(confirm).not.toHaveTextContent('Server detail 1234');
      await expectRefetches(list, before, refetches);
    },
  );

  it('a network error keeps the dialog open; Retry succeeds', async () => {
    let calls = 0;
    server.use(
      walletCore.mutation('ResendStaffInvitation', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : undefined;
      }),
    );
    await openStaff();

    const confirm = await choose(MOCK_INVITED_EMAIL, 'Resend invitation');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Resend' }));
    expect(
      await within(confirm).findByText('Could not reach the server', { exact: false }),
    ).toBeInTheDocument();

    await userEvent.click(within(confirm).getByRole('button', { name: 'Resend' }));
    expect(
      await screen.findByText(`New invitation link issued for ${MOCK_INVITED_EMAIL}`),
    ).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});

describe('change role', () => {
  beforeEach(() => signInForTest({ staff: ADMIN }));

  async function selectRole(confirm: HTMLElement, role: string) {
    await userEvent.click(within(confirm).getByRole('combobox', { name: 'New role' }));
    await userEvent.click(await screen.findByRole('option', { name: role }));
  }

  it('starts at the current role and sends nothing until another role is selected', async () => {
    const calls = countCalls('ChangeStaffRole');
    server.use(calls.handler);
    await openStaff();

    const confirm = await choose(SUPPORT_EMAIL, 'Change role');
    expect(within(confirm).getByRole('combobox', { name: 'New role' })).toHaveTextContent(
      'Support',
    );
    const button = within(confirm).getByRole('button', { name: 'Change role' });
    expect(button).toBeDisabled();

    await userEvent.click(within(confirm).getByRole('combobox', { name: 'New role' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Admin',
      'Compliance',
      'Finance',
      'Support',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'Support' }));
    expect(button).toBeDisabled();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(calls.counter.calls).toBe(0);
  });

  it('changes the role once and updates the list', async () => {
    const { calls, release } = held('ChangeStaffRole');
    await openStaff();

    const confirm = await choose(SUPPORT_EMAIL, 'Change role');
    await selectRole(confirm, 'Finance');
    await userEvent.dblClick(within(confirm).getByRole('button', { name: 'Change role' }));
    expect(await within(confirm).findByRole('button', { name: 'Changing…' })).toBeDisabled();
    release();

    expect(
      await screen.findByText(`Role of ${SUPPORT_EMAIL} changed to Finance`),
    ).toBeInTheDocument();
    await waitFor(() => expect(roleOf(SUPPORT_EMAIL)).toHaveTextContent('FINANCE'));
    expect(calls.calls).toBe(1);
  });

  it('LAST_ADMIN: the only admin cannot demote themself; the list stays', async () => {
    const list = countList();
    await openStaff();
    const before = list.calls;

    const confirm = await choose('admin@example.com', 'Change role');
    expect(confirm).toHaveTextContent('This is your own account');
    await selectRole(confirm, 'Support');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Change role' }));

    expect(
      await within(confirm).findByText('The last active admin cannot be demoted.', {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(roleOf('admin@example.com')).toHaveTextContent('ADMIN');
    expect(loadSession()?.staff.id).toBe('staff-admin');
    // Nothing changed on the server: no refetch.
    await expectRefetches(list, before, 0);
  });

  it.each([
    ['STAFF_NOT_FOUND', 'This staff account no longer exists.', 1],
    ['FORBIDDEN', 'You do not have permission to change staff roles.', 0],
  ])(
    'shows %s and does not change the row, refetching the list only when it is stale',
    async (code, text, refetches) => {
      server.use(failWith('ChangeStaffRole', code));
      const list = countList();
      await openStaff();
      const before = list.calls;

      const confirm = await choose(SUPPORT_EMAIL, 'Change role');
      await selectRole(confirm, 'Finance');
      await userEvent.click(within(confirm).getByRole('button', { name: 'Change role' }));

      expect(await within(confirm).findByText(text, { exact: false })).toBeInTheDocument();
      expect(roleOf(SUPPORT_EMAIL)).toHaveTextContent('SUPPORT');
      await expectRefetches(list, before, refetches);
    },
  );

  it('a network error keeps the role; Retry changes it', async () => {
    let calls = 0;
    server.use(
      walletCore.mutation('ChangeStaffRole', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : undefined;
      }),
    );
    await openStaff();

    const confirm = await choose(SUPPORT_EMAIL, 'Change role');
    await selectRole(confirm, 'Compliance');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Change role' }));
    expect(
      await within(confirm).findByText('Could not reach the server', { exact: false }),
    ).toBeInTheDocument();
    expect(roleOf(SUPPORT_EMAIL)).toHaveTextContent('SUPPORT');

    await userEvent.click(within(confirm).getByRole('button', { name: 'Change role' }));
    await waitFor(() => expect(roleOf(SUPPORT_EMAIL)).toHaveTextContent('COMPLIANCE'));
  });

  it('changing the own role logs out and asks to log in again', async () => {
    await secondAdmin();
    const { router } = await openStaff();

    const confirm = await choose('admin@example.com', 'Change role');
    await selectRole(confirm, 'Finance');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Change role' }));

    expect(
      await screen.findByText('Your role was changed to Finance. Log in again.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(loadSession()).toBeNull();
  });
});

describe('deactivate', () => {
  beforeEach(() => signInForTest({ staff: ADMIN }));

  it('names the account; Cancel sends nothing', async () => {
    const calls = countCalls('DeactivateStaff');
    server.use(calls.handler);
    await openStaff();

    const confirm = await choose(SUPPORT_EMAIL, 'Deactivate', 'Deactivate staff member');
    expect(confirm).toHaveTextContent(`Deactivate ${SUPPORT_EMAIL} (Support)?`);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.counter.calls).toBe(0);
    expect(statusOf(SUPPORT_EMAIL)).toHaveTextContent('ACTIVE');
  });

  it('deactivates once on Confirm and shows DEACTIVATED', async () => {
    const { calls, release } = held('DeactivateStaff');
    await openStaff();

    const confirm = await choose(SUPPORT_EMAIL, 'Deactivate', 'Deactivate staff member');
    await userEvent.dblClick(within(confirm).getByRole('button', { name: 'Deactivate' }));
    expect(await within(confirm).findByRole('button', { name: 'Deactivating…' })).toBeDisabled();
    release();

    expect(await screen.findByText(`${SUPPORT_EMAIL} deactivated`)).toBeInTheDocument();
    await waitFor(() => expect(statusOf(SUPPORT_EMAIL)).toHaveTextContent('DEACTIVATED'));
    expect(actionsButton(SUPPORT_EMAIL)).not.toBeInTheDocument();
    expect(calls.calls).toBe(1);
  });

  it.each([
    ['CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account.'],
    ['LAST_ADMIN', 'The last active admin cannot be deactivated.'],
    ['STAFF_NOT_FOUND', 'This staff account no longer exists.'],
    ['FORBIDDEN', 'You do not have permission to deactivate staff.'],
    ['UNAUTHENTICATED', 'Your session has ended. Log in again.'],
  ])('shows %s and keeps the row as it was', async (code, text) => {
    server.use(failWith('DeactivateStaff', code));
    await openStaff();

    const confirm = await choose(SUPPORT_EMAIL, 'Deactivate', 'Deactivate staff member');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Deactivate' }));

    expect(await within(confirm).findByText(text, { exact: false })).toBeInTheDocument();
    expect(confirm).not.toHaveTextContent('Server detail 1234');
    expect(statusOf(SUPPORT_EMAIL)).toHaveTextContent('ACTIVE');
  });

  it('a network error keeps the row; Retry deactivates', async () => {
    let calls = 0;
    server.use(
      walletCore.mutation('DeactivateStaff', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : undefined;
      }),
    );
    await openStaff();

    const confirm = await choose(SUPPORT_EMAIL, 'Deactivate', 'Deactivate staff member');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Deactivate' }));
    expect(
      await within(confirm).findByText('Could not reach the server', { exact: false }),
    ).toBeInTheDocument();
    expect(statusOf(SUPPORT_EMAIL)).toHaveTextContent('ACTIVE');

    await userEvent.click(within(confirm).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(statusOf(SUPPORT_EMAIL)).toHaveTextContent('DEACTIVATED'));
  });

  it('a new dialog starts without the error of the previous one', async () => {
    server.use(failWith('DeactivateStaff', 'FORBIDDEN'));
    await openStaff();

    const first = await choose(SUPPORT_EMAIL, 'Deactivate', 'Deactivate staff member');
    await userEvent.click(within(first).getByRole('button', { name: 'Deactivate' }));
    await within(first).findByRole('alert');
    await userEvent.click(within(first).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const second = await choose(MOCK_INVITED_EMAIL, 'Deactivate', 'Deactivate staff member');
    expect(second).toHaveTextContent(MOCK_INVITED_EMAIL);
    expect(within(second).queryByRole('alert')).not.toBeInTheDocument();
  });
});
