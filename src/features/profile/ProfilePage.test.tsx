import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { clearSession, loadSession, type SessionStaff } from '../../graphql/session';
import { refreshSession } from '../../graphql/client';
import { server } from '../../mocks/server';
import { MOCK_PASSWORD } from '../../mocks/staff';
import { ADMIN, countCalls, signInForTest, SUPPORT, walletCore } from '../../test/auth';
import { renderApp } from '../../test/render';
import { staffLogin } from '../auth/authApi';

const NEW_PASSWORD = 'Changed1234!';

/** Every wallet-core role, with its permissions from the role table. */
const ROLES: SessionStaff[] = [
  ADMIN,
  SUPPORT,
  { ...SUPPORT, role: 'COMPLIANCE', permissions: ['bo'] },
  { ...SUPPORT, role: 'FINANCE', permissions: ['bo', 'bo:settings', 'bo:settings:modify'] },
];

function signInAs(staff: SessionStaff) {
  signInForTest({ staff });
  server.use(walletCore.query('StaffMe', () => HttpResponse.json({ data: { staffMe: staff } })));
}

const form = () => screen.getByRole('form', { name: 'Change password' });
const field = (label: string) => within(form()).getByLabelText(new RegExp(`^${label}`));
const submit = () => within(form()).getByRole('button', { name: /^Change(ing)? password/ });

async function openProfile() {
  const rendered = renderApp('/profile');
  await screen.findByRole('heading', { name: 'Profile' });
  return rendered;
}

async function fill(current: string, next: string, confirm = next) {
  if (current) await userEvent.type(field('Current password'), current);
  if (next) await userEvent.type(field('New password'), next);
  if (confirm) await userEvent.type(field('Confirm new password'), confirm);
}

describe('profile access', () => {
  it.each(ROLES.map((staff) => [staff.role, staff] as const))(
    '%s opens Profile from the header and sees their account',
    async (_role, staff) => {
      signInAs(staff);
      const { router } = renderApp('/');

      await userEvent.click(await screen.findByRole('link', { name: 'Profile' }));

      expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/profile');
      const account = screen.getByRole('region', { name: 'Account' });
      expect(account).toHaveTextContent(staff.email);
      for (const permission of staff.permissions) {
        expect(within(account).getByText(permission)).toBeInTheDocument();
      }
      expect(account).not.toHaveTextContent(staff.id);
      expect(form()).toBeInTheDocument();
    },
  );

  it('without a staff login, a dev user without bo gets No Access', async () => {
    renderApp('/profile');
    expect(await screen.findByRole('heading', { name: 'No Access' })).toBeInTheDocument();
  });
});

describe('change own password', () => {
  beforeEach(() => signInForTest({ staff: SUPPORT }));

  it('checks the rules and the confirmation locally before sending anything', async () => {
    const calls = countCalls('ChangeOwnStaffPassword');
    server.use(calls.handler);
    await openProfile();

    expect(submit()).toBeDisabled();
    await fill(MOCK_PASSWORD, 'weak', 'weak');
    expect(submit()).toBeDisabled();

    await userEvent.clear(field('New password'));
    await userEvent.clear(field('Confirm new password'));
    await fill('', NEW_PASSWORD, 'Different1234!');
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(submit()).toBeDisabled();

    // Even a submit (e.g. Enter) sends nothing while the form is invalid.
    fireEvent.submit(form());
    expect(calls.counter.calls).toBe(0);
  });

  it('needs the current password', async () => {
    await openProfile();
    await fill('', NEW_PASSWORD);
    expect(submit()).toBeDisabled();
  });

  it('changes the password once, clears the fields, keeps the current refresh session and rejects the replaced refresh cookie', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const calls = countCalls('ChangeOwnStaffPassword', () => gate);
    server.use(calls.handler);
    // The refresh cookie from before the change (replayed later; not a separate browser).
    const previousCookie = document.cookie;
    await openProfile();

    await fill(MOCK_PASSWORD, NEW_PASSWORD);
    await userEvent.dblClick(submit());
    expect(
      await within(form()).findByRole('button', { name: 'Changing password…' }),
    ).toBeDisabled();
    release();

    expect(await screen.findByText(/Your password has been changed\./)).toBeInTheDocument();
    expect(calls.counter.calls).toBe(1);
    expect(field('Current password')).toHaveValue('');
    expect(field('New password')).toHaveValue('');
    expect(field('Confirm new password')).toHaveValue('');
    expect(document.body).not.toHaveTextContent(NEW_PASSWORD);
    expect(JSON.stringify(localStorage)).not.toContain(NEW_PASSWORD);
    expect(JSON.stringify(sessionStorage)).not.toContain(NEW_PASSWORD);

    // The current session stays (refresh works); the pre-change refresh cookie is rejected; only the new password logs in.
    expect(screen.getByTestId('current-staff')).toHaveTextContent(SUPPORT.email);
    expect(await refreshSession()).toBe(true);
    expect(loadSession()?.staff.id).toBe(SUPPORT.id);
    document.cookie = `${previousCookie}; path=/`;
    expect(await refreshSession()).toBe(false);
    clearSession();
    await expect(staffLogin({ email: SUPPORT.email, password: MOCK_PASSWORD })).rejects.toThrow();
    await expect(
      staffLogin({ email: SUPPORT.email, password: NEW_PASSWORD }),
    ).resolves.toMatchObject({ id: SUPPORT.id });
  });

  it('shows a wrong current password at its field, without any password', async () => {
    await openProfile();
    await fill('Wrong1234!', NEW_PASSWORD);
    await userEvent.click(submit());

    expect(await screen.findByText('The current password is incorrect.')).toBeInTheDocument();
    expect(field('Current password')).toHaveAttribute('aria-invalid', 'true');
    expect(document.body).not.toHaveTextContent('Wrong1234!');
    expect(document.body).not.toHaveTextContent(NEW_PASSWORD);

    // Editing that field clears the error; the other values stay for another try.
    await userEvent.type(field('Current password'), 'x');
    expect(screen.queryByText('The current password is incorrect.')).not.toBeInTheDocument();
    expect(field('New password')).toHaveValue(NEW_PASSWORD);
  });

  it('shows BAD_USER_INPUT for newPassword at the new password field', async () => {
    server.use(
      walletCore.mutation('ChangeOwnStaffPassword', () =>
        HttpResponse.json({
          data: null,
          errors: [
            {
              message: `Too weak: ${NEW_PASSWORD}`,
              extensions: { code: 'BAD_USER_INPUT', field: 'newPassword' },
            },
          ],
        }),
      ),
    );
    await openProfile();
    await fill(MOCK_PASSWORD, NEW_PASSWORD);
    await userEvent.click(submit());

    expect(
      await screen.findByText('The new password does not meet the requirements.'),
    ).toBeInTheDocument();
    expect(field('New password')).toHaveAttribute('aria-invalid', 'true');
    expect(document.body).not.toHaveTextContent(/Too weak/);
  });

  it.each([
    ['UNAUTHENTICATED', 'Your session has ended. Log in again.'],
    ['FORBIDDEN', 'Your account cannot change its password.'],
    ['INTERNAL_SERVER_ERROR', 'Something went wrong. Please try again.'],
  ])('shows %s in our words', async (code, text) => {
    server.use(
      walletCore.mutation('ChangeOwnStaffPassword', () =>
        HttpResponse.json({
          data: null,
          errors: [{ message: 'Server detail', extensions: { code } }],
        }),
      ),
    );
    await openProfile();
    await fill(MOCK_PASSWORD, NEW_PASSWORD);
    await userEvent.click(submit());

    expect(await within(form()).findByRole('alert')).toHaveTextContent(text);
    expect(document.body).not.toHaveTextContent('Server detail');
  });

  it('a network error keeps the values; a retry changes the password', async () => {
    let calls = 0;
    server.use(
      walletCore.mutation('ChangeOwnStaffPassword', () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : undefined;
      }),
    );
    await openProfile();
    await fill(MOCK_PASSWORD, NEW_PASSWORD);
    await userEvent.click(submit());

    expect(await within(form()).findByRole('alert')).toHaveTextContent(
      'Could not reach the server',
    );
    expect(field('New password')).toHaveValue(NEW_PASSWORD);
    await userEvent.click(submit());
    expect(await screen.findByText(/Your password has been changed\./)).toBeInTheDocument();
    await waitFor(() => expect(calls).toBe(2));
  });
});
