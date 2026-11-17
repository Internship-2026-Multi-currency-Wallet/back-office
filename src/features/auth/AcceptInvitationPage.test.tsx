import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { loadSession } from '../../graphql/session';
import { server } from '../../mocks/server';
import { MOCK_INVITATION_TOKEN } from '../../mocks/staff';
import { walletCore } from '../../test/auth';
import { renderApp } from '../../test/render';

const STRONG = 'Invited1234!';
const url = (token = MOCK_INVITATION_TOKEN) => `/accept-invitation?token=${token}`;

async function setPassword(password: string, confirm = password) {
  await userEvent.type(await screen.findByLabelText(/^New password/), password);
  await userEvent.type(screen.getByLabelText(/^Confirm password/), confirm);
}
const submit = () => screen.getByRole('button', { name: /Set(ting)? password/ });

describe('accept invitation', () => {
  it('sets the password and links to Login without logging in', async () => {
    const { router } = renderApp(url());
    expect(await screen.findByRole('heading', { name: 'Accept invitation' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/accept-invitation');

    await setPassword(STRONG);
    await userEvent.click(submit());

    expect(await screen.findByText(/Your password is set/)).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: 'Go to login' }));
    expect(router.state.location.pathname).toBe('/login');
    expect(loadSession()).toBeNull();
    expect(JSON.stringify({ ...localStorage })).not.toContain(MOCK_INVITATION_TOKEN);
  });

  it('shows the password rules and blocks a weak or mismatched password', async () => {
    renderApp(url());
    const rules = await screen.findByRole('list', { name: 'Password requirements' });
    await userEvent.type(screen.getByLabelText(/^New password/), 'invited1');
    expect(within(rules).getAllByText('✓')).toHaveLength(2); // length + digit
    expect(submit()).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/^New password/));
    await setPassword(STRONG, `${STRONG}x`);
    expect(within(rules).getAllByText('✓')).toHaveLength(4);
    expect(screen.getByText('Passwords do not match.')).toBeVisible();
    expect(submit()).toBeDisabled();
  });

  it('shows the loading state while the request runs', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      walletCore.mutation('AcceptStaffInvitation', async () => {
        await held;
        return HttpResponse.json({ data: { acceptStaffInvitation: true } });
      }),
    );
    renderApp(url());
    await setPassword(STRONG);
    await userEvent.click(submit());

    expect(await screen.findByRole('button', { name: 'Setting password…' })).toBeDisabled();
    expect(screen.getByLabelText(/^New password/)).toBeDisabled();
    release();
    expect(await screen.findByText(/Your password is set/)).toBeVisible();
  });

  it('explains a link without a token and offers no form', async () => {
    renderApp('/accept-invitation');
    expect(await screen.findByRole('alert')).toHaveTextContent('invitation link is incomplete');
    expect(screen.queryByLabelText(/^New password/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to login' })).toBeVisible();
  });

  it('explains an invalid, used or expired token (INVALID_INVITATION) and hides the form', async () => {
    renderApp(url('expired-token'));
    await setPassword(STRONG);
    await userEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This invitation link is invalid, already used or expired.',
    );
    expect(screen.queryByLabelText(/^New password/)).not.toBeInTheDocument();
  });

  it('shows a password rejected by the server (BAD_USER_INPUT) and keeps the form', async () => {
    server.use(
      walletCore.mutation('AcceptStaffInvitation', () =>
        HttpResponse.json({
          errors: [
            {
              message: 'Password must contain at least one digit',
              extensions: { code: 'BAD_USER_INPUT', field: 'password' },
            },
          ],
        }),
      ),
    );
    renderApp(url());
    await setPassword(STRONG);
    await userEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The password does not meet the requirements.',
    );
    expect(screen.getByLabelText(/^New password/)).toBeEnabled();
  });

  it('shows a network failure and lets the staff member retry', async () => {
    server.use(
      walletCore.mutation('AcceptStaffInvitation', () => HttpResponse.error(), { once: true }),
    );
    renderApp(url());
    await setPassword(STRONG);
    await userEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    await userEvent.click(submit());
    expect(await screen.findByText(/Your password is set/)).toBeVisible();
  });
});
