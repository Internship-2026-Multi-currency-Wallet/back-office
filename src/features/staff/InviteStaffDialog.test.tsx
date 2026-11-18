import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { request, toRequestError } from '../../graphql/client';
import type { SessionStaff } from '../../graphql/session';
import { server } from '../../mocks/server';
import { MOCK_INVITATION_TOKEN, MOCK_INVITED_EMAIL } from '../../mocks/staff';
import { ADMIN, countCalls, signInForTest, SUPPORT, walletCore } from '../../test/auth';
import { renderApp } from '../../test/render';
import { acceptStaffInvitation, staffLogin } from '../auth/authApi';
import { inviteStaffMutation, staffMembersQuery } from './staff.wallet-core';

// Without a staff session the requests carry this dev user: `bo:staff` without `bo:staff:modify`.
// A staff session (`signInForTest`) wins over it, as in the app.
vi.mock('../../config-env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config-env')>();
  return { ...actual, config: { ...actual.config, devUser: '100:bo,bo:staff' } };
});

const NEW_EMAIL = 'new.person@example.com';

const inviteButton = () => screen.queryByRole('button', { name: 'Invite staff' });
const dialog = () => screen.getByRole('dialog', { name: 'Invite staff' });
const emailField = () => within(dialog()).getByRole('textbox', { name: /Email/ });
const roleField = () => within(dialog()).getByRole('combobox', { name: /Role/ });
const submit = () => within(dialog()).getByRole('button', { name: /^Invit/ });

function rowOf(email: string): HTMLElement {
  const row = screen.getByText(email).closest<HTMLElement>('[role="row"]');
  if (!row) throw new Error(`No row for ${email}`);
  return row;
}

async function openDialog() {
  renderApp('/staff');
  await screen.findByText('admin@example.com');
  await userEvent.click(await screen.findByRole('button', { name: 'Invite staff' }));
  return dialog();
}

async function fill(email: string, role?: string) {
  if (email) await userEvent.type(emailField(), email);
  if (role) {
    await userEvent.click(roleField());
    await userEvent.click(await screen.findByRole('option', { name: role }));
  }
}

const invite = (email: string, role: SessionStaff['role'] = 'SUPPORT') =>
  request('walletCore', inviteStaffMutation, { input: { email, role } }).then(
    ({ inviteStaff }) => ({ data: inviteStaff }),
    (error: unknown) => ({ error: toRequestError(error) }),
  );

describe('invite staff access', () => {
  it('ADMIN sees Invite staff and opens an empty form without a preselected role', async () => {
    signInForTest({ staff: ADMIN });
    await openDialog();

    expect(emailField()).toHaveValue('');
    expect(roleField()).toHaveTextContent(/^\W*$/);
    await userEvent.click(roleField());
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Admin',
      'Compliance',
      'Finance',
      'Support',
    ]);
  });

  it.each([
    SUPPORT,
    { ...SUPPORT, role: 'COMPLIANCE' as const },
    {
      ...SUPPORT,
      role: 'FINANCE' as const,
      permissions: ['bo', 'bo:settings', 'bo:settings:modify'],
    },
  ])('$role does not see Invite staff', async (staff) => {
    signInForTest({ staff });
    server.use(walletCore.query('StaffMe', () => HttpResponse.json({ data: { staffMe: staff } })));
    renderApp('/staff');

    expect(await screen.findByRole('heading', { name: 'No Access' })).toBeInTheDocument();
    expect(inviteButton()).not.toBeInTheDocument();
  });

  it('a caller with bo:staff but without bo:staff:modify sees the list but cannot invite', async () => {
    renderApp('/staff');

    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
    expect(inviteButton()).not.toBeInTheDocument();

    expect(await invite(NEW_EMAIL)).toEqual({
      error: { message: 'Missing permission: bo:staff:modify', code: 'FORBIDDEN' },
    });
    const { staffMembers } = await request('walletCore', staffMembersQuery);
    expect(staffMembers.map((member) => member.email)).not.toContain(NEW_EMAIL);
  });
});

describe('invite staff form', () => {
  beforeEach(() => signInForTest({ staff: ADMIN }));

  it('validates email and role before sending anything', async () => {
    const calls = countCalls('InviteStaff');
    server.use(calls.handler);
    await openDialog();

    await userEvent.click(submit());
    expect(within(dialog()).getByText('Email is required.')).toBeInTheDocument();
    expect(within(dialog()).getByText('Select a role.')).toBeInTheDocument();

    await fill('   ');
    expect(within(dialog()).getByText('Email is required.')).toBeInTheDocument();
    await userEvent.clear(emailField());
    await fill('not-an-email', 'Support');
    expect(within(dialog()).getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(within(dialog()).queryByText('Select a role.')).not.toBeInTheDocument();

    await userEvent.clear(emailField());
    fireEvent.change(emailField(), { target: { value: `${'a'.repeat(244)}@example.com` } });
    expect(within(dialog()).getByText('Email must be at most 255 characters.')).toBeInTheDocument();

    expect(calls.counter.calls).toBe(0);
  });

  it('invites, closes, says so and shows the new INVITED row from a refetched list', async () => {
    const list = countCalls('StaffMembers');
    server.use(list.handler);
    await openDialog();
    const listCalls = list.counter.calls;

    await fill(`  ${NEW_EMAIL.toUpperCase()} `, 'Finance');
    await userEvent.click(submit());

    expect(await screen.findByText('Staff invited')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Invite staff' })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(NEW_EMAIL)).toBeInTheDocument();
    expect(within(rowOf(NEW_EMAIL)).getByText('FINANCE')).toBeInTheDocument();
    expect(within(rowOf(NEW_EMAIL)).getByText('INVITED')).toBeInTheDocument();
    expect(list.counter.calls).toBe(listCalls + 1);
    expect(document.body).not.toHaveTextContent('mock-invitation');

    await userEvent.click(screen.getByRole('button', { name: 'Invite staff' }));
    expect(emailField()).toHaveValue('');
    expect(roleField()).toHaveTextContent(/^\W*$/);
  });

  it('shows the loading state, cannot be closed and sends one invitation for repeated submits', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const calls = countCalls('InviteStaff', () => held);
    server.use(calls.handler);
    await openDialog();
    await fill(NEW_EMAIL, 'Support');

    const form = within(dialog()).getByRole('form', { name: 'Invite staff' });
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(await within(dialog()).findByRole('button', { name: 'Inviting…' })).toBeDisabled();
    expect(emailField()).toBeDisabled();
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(dialog()).toBeInTheDocument();

    release();
    expect(await screen.findByText('Staff invited')).toBeInTheDocument();
    expect(calls.counter.calls).toBe(1);
  });

  it.each([
    ['an INVITED', ` ${MOCK_INVITED_EMAIL.toUpperCase()}`],
    ['an ACTIVE', 'support@example.com'],
  ])(
    'shows a duplicate email of %s account on the field and keeps the values',
    async (_, email) => {
      await openDialog();
      await fill(email, 'Admin');
      await userEvent.click(submit());

      const duplicate = 'A staff member with this email already exists.';
      expect(await within(dialog()).findByText(duplicate)).toBeInTheDocument();
      expect(emailField()).toHaveAttribute('aria-invalid', 'true');
      // An email input drops the surrounding whitespace itself.
      expect(emailField()).toHaveValue(email.trim());
      expect(roleField()).toHaveTextContent('Admin');

      await fill('', 'Support');
      expect(within(dialog()).getByText(duplicate)).toBeInTheDocument();
      await userEvent.type(emailField(), 'x');
      expect(within(dialog()).queryByText(duplicate)).not.toBeInTheDocument();
      expect(emailField()).toHaveAttribute('aria-invalid', 'false');
    },
  );

  it.each([
    [
      'BAD_USER_INPUT on email',
      () => fail('BAD_USER_INPUT', { field: 'email' }),
      'Enter a valid email address.',
    ],
    ['FORBIDDEN', () => fail('FORBIDDEN'), 'You do not have permission to invite staff.'],
    [
      'a network failure',
      () => HttpResponse.error(),
      'Could not reach the server. Check your connection and try again.',
    ],
    ['an unexpected error', () => fail('INTERNAL_SERVER_ERROR'), 'Something went wrong.'],
  ])('shows %s as a controlled message and keeps the values', async (_, answer, text) => {
    server.use(walletCore.mutation('InviteStaff', answer));
    await openDialog();
    await fill(NEW_EMAIL, 'Support');
    await userEvent.click(submit());

    expect(await within(dialog()).findByText(new RegExp(text))).toBeInTheDocument();
    expect(emailField()).toHaveValue(NEW_EMAIL);
    expect(roleField()).toHaveTextContent('Support');
    expect(submit()).toBeEnabled();
  });
});

function fail(code: string, extensions: Record<string, string> = {}) {
  return HttpResponse.json({
    data: null,
    errors: [{ message: 'Server says no', extensions: { ...extensions, code } }],
  });
}

describe('mock InviteStaff contract', () => {
  beforeEach(() => signInForTest({ staff: ADMIN }));

  it('normalizes the email and returns only the public staff fields, without a token', async () => {
    const result = await invite('  New.Person@Example.COM ', 'FINANCE');

    expect(result).toEqual({
      data: {
        id: 'staff-invite-1',
        email: NEW_EMAIL,
        role: 'FINANCE',
        status: 'INVITED',
        createdAt: expect.any(String) as string,
      },
    });
    const { staffMembers } = await request('walletCore', staffMembersQuery);
    expect(staffMembers.at(-1)).toEqual((result as { data: unknown }).data);
    expect(JSON.stringify([result, staffMembers])).not.toMatch(/token|mock-invitation/i);
  });

  it.each([
    ['an invalid email', 'not-an-email'],
    ['a too long email', `${'a'.repeat(244)}@example.com`],
  ])('rejects %s with BAD_USER_INPUT on email', async (_, email) => {
    const result = await invite(email);

    expect(result).toEqual({
      error: expect.objectContaining({ code: 'BAD_USER_INPUT', extensions: { field: 'email' } }),
    });
  });

  it('rejects an email of any existing staff account, case-insensitively', async () => {
    for (const email of ['ADMIN@example.com', MOCK_INVITED_EMAIL, NEW_EMAIL]) {
      if (email === NEW_EMAIL) await invite(NEW_EMAIL);
      expect(await invite(email)).toEqual({
        error: expect.objectContaining({ code: 'STAFF_ALREADY_EXISTS' }),
      });
    }
  });

  it('rejects a SUPPORT token with FORBIDDEN', async () => {
    signInForTest({ staff: SUPPORT });

    expect(await invite(NEW_EMAIL)).toEqual({
      error: { message: 'Missing permission: bo:staff:modify', code: 'FORBIDDEN' },
    });
  });

  it('lets the invited staff member accept the invitation and log in with the assigned role', async () => {
    await invite('first@example.com');
    await invite(NEW_EMAIL, 'FINANCE');

    await expect(staffLogin({ email: NEW_EMAIL, password: 'Invited1234!' })).rejects.toThrow();
    await expect(
      acceptStaffInvitation({ token: 'mock-invitation-1', password: 'Invited1234!' }),
    ).resolves.toBe(true);
    await expect(
      acceptStaffInvitation({ token: 'mock-invitation-2', password: 'Invited1234!' }),
    ).resolves.toBe(true);

    expect(await staffLogin({ email: NEW_EMAIL, password: 'Invited1234!' })).toEqual({
      id: 'staff-invite-2',
      email: NEW_EMAIL,
      role: 'FINANCE',
      permissions: ['bo', 'bo:settings', 'bo:settings:modify'],
    });
  });

  it('keeps the fixed invitation fixture working next to new invitations', async () => {
    await invite(NEW_EMAIL);

    await expect(
      acceptStaffInvitation({ token: MOCK_INVITATION_TOKEN, password: 'Invited1234!' }),
    ).resolves.toBe(true);
    expect((await staffLogin({ email: MOCK_INVITED_EMAIL, password: 'Invited1234!' })).role).toBe(
      'SUPPORT',
    );
  });
});
