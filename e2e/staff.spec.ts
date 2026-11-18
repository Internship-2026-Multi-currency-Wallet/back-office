import { expect, type Page, test } from '@playwright/test';

test('an admin opens Staff from the menu and sees roles and statuses in the list (mocks)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('Admin1234!');
  await page.getByRole('button', { name: 'Log in' }).click();

  await page.getByRole('link', { name: 'Staff' }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible();

  const row = (email: string) => page.getByRole('row').filter({ hasText: email });
  await expect(row('admin@example.com')).toContainText('ADMIN');
  await expect(row('admin@example.com')).toContainText('ACTIVE');
  await expect(row('invited@example.com')).toContainText('SUPPORT');
  await expect(row('invited@example.com')).toContainText('INVITED');
});

// The mocks live in the page: everything happens in one document (no reload, no page.goto after the start), or
// the new invitation is gone.
test('an admin invites a Support member who accepts, logs in and sees the limited menu (mocks)', async ({
  page,
}) => {
  const email = 'new.support@example.com';
  // The first invitation of a document gets this mock token; it is never shown or returned by the API.
  const token = 'mock-invitation-1';
  /**
   * Client-side navigation, like a link: React Router follows `popstate`, the mocks keep their state.
   * Scripts as strings: the e2e tsconfig has no DOM types.
   */
  const navigateInApp = (url: string) =>
    page.evaluate(
      `history.pushState({}, '', ${JSON.stringify(url)}); dispatchEvent(new PopStateEvent('popstate'))`,
    );

  await page.goto('/');
  await page.evaluate('window.e2eSameDocument = true');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('Admin1234!');
  await page.getByRole('button', { name: 'Log in' }).click();

  await page.getByRole('link', { name: 'Staff' }).click();
  await page.getByRole('button', { name: 'Invite staff' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invite staff' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByRole('combobox', { name: 'Role' }).click();
  await page.getByRole('option', { name: 'Support' }).click();
  await dialog.getByRole('button', { name: 'Invite' }).click();

  await expect(page.getByText('Staff invited')).toBeVisible();
  await expect(dialog).toBeHidden();
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toContainText('SUPPORT');
  await expect(row).toContainText('INVITED');
  await expect(page.getByText(token)).toHaveCount(0);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await navigateInApp(`/accept-invitation?token=${token}`);
  await page.getByLabel('New password').fill('Support1234!');
  await page.getByLabel('Confirm password').fill('Support1234!');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('Your password is set')).toBeVisible();

  await page.getByRole('link', { name: 'Go to login' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Support1234!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('current-staff')).toHaveText(`${email} · SUPPORT`);
  await expect(page.getByRole('link', { name: 'Staff' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);

  for (const path of ['/staff', '/settings']) {
    await navigateInApp(path);
    await expect(page.getByRole('heading', { name: 'No Access' })).toBeVisible();
    await expect(page.getByTestId('current-staff')).toHaveText(`${email} · SUPPORT`);
  }
  expect(await page.evaluate('window.e2eSameDocument')).toBe(true);
});

/** Client-side navigation in the same document, so the in-page mocks keep their state (see above). */
const navigateIn = (page: Page, url: string) =>
  page.evaluate(
    `history.pushState({}, '', ${JSON.stringify(url)}); dispatchEvent(new PopStateEvent('popstate'))`,
  );

async function logIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

async function rowAction(page: Page, email: string, action: string) {
  await page.getByRole('button', { name: `Actions for ${email}` }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

test('an admin resends an invitation: the old link stops working, the new one activates (mocks)', async ({
  page,
}) => {
  const email = 'invited@example.com';
  await page.goto('/');
  await page.evaluate('window.e2eSameDocument = true');
  await logIn(page, 'admin@example.com', 'Admin1234!');
  await page.getByRole('link', { name: 'Staff' }).click();

  await rowAction(page, email, 'Resend invitation');
  const dialog = page.getByRole('dialog', { name: 'Resend invitation' });
  await expect(dialog).toContainText(email);
  await dialog.getByRole('button', { name: 'Resend' }).click();
  await expect(page.getByText(`New invitation link issued for ${email}`)).toBeVisible();
  await expect(page.getByText(/mock-invitation/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Log out' }).click();
  // The fixture's original token, then the replacement (the first new token of this document).
  await navigateIn(page, '/accept-invitation?token=mock-invitation');
  await page.getByLabel('New password').fill('Invited1234!');
  await page.getByLabel('Confirm password').fill('Invited1234!');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(
    page.getByText('This invitation link is invalid, already used or expired'),
  ).toBeVisible();

  // Via the login page, so the invitation page starts fresh, as when the new email link is opened.
  await page.getByRole('link', { name: 'Go to login' }).click();
  await navigateIn(page, '/accept-invitation?token=mock-invitation-1');
  await page.getByLabel('New password').fill('Invited1234!');
  await page.getByLabel('Confirm password').fill('Invited1234!');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('Your password is set')).toBeVisible();
  await page.getByRole('link', { name: 'Go to login' }).click();
  await logIn(page, email, 'Invited1234!');
  await expect(page.getByTestId('current-staff')).toHaveText(`${email} · SUPPORT`);
  expect(await page.evaluate('window.e2eSameDocument')).toBe(true);
});

test('role change, own password change and deactivation take effect at the next login (mocks)', async ({
  page,
}) => {
  const support = 'support@example.com';
  const row = (email: string) => page.getByRole('row').filter({ hasText: email });
  await page.goto('/');
  await page.evaluate('window.e2eSameDocument = true');
  await logIn(page, 'admin@example.com', 'Admin1234!');
  await page.getByRole('link', { name: 'Staff' }).click();

  await rowAction(page, support, 'Change role');
  const roleDialog = page.getByRole('dialog', { name: 'Change role' });
  await expect(roleDialog.getByRole('button', { name: 'Change role' })).toBeDisabled();
  await roleDialog.getByRole('combobox', { name: 'New role' }).click();
  await page.getByRole('option', { name: 'Finance' }).click();
  await roleDialog.getByRole('button', { name: 'Change role' }).click();
  await expect(page.getByText(`Role of ${support} changed to Finance`)).toBeVisible();
  await expect(row(support)).toContainText('FINANCE');
  await page.getByRole('button', { name: 'Log out' }).click();

  // Finance now: Settings, but still no Staff. Then the own password, from Profile.
  await logIn(page, support, 'Admin1234!');
  await expect(page.getByTestId('current-staff')).toHaveText(`${support} · FINANCE`);
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Staff' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByRole('region', { name: 'Account' })).toContainText(support);
  const form = page.getByRole('form', { name: 'Change password' });
  await form.getByLabel('Current password').fill('Admin1234!');
  await form.getByRole('textbox', { name: 'New password', exact: true }).fill('Finance1234!');
  await form.getByLabel('Confirm new password').fill('Finance1234!');
  await form.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Your password has been changed.')).toBeVisible();
  await expect(form.getByLabel('Current password')).toHaveValue('');
  await page.getByRole('button', { name: 'Log out' }).click();

  await logIn(page, support, 'Admin1234!');
  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await page.getByLabel('Password').fill('Finance1234!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('current-staff')).toHaveText(`${support} · FINANCE`);
  await page.getByRole('button', { name: 'Log out' }).click();

  // Deactivation: Cancel first, then Confirm; the account cannot log in any more.
  await logIn(page, 'admin@example.com', 'Admin1234!');
  await page.getByRole('link', { name: 'Staff' }).click();
  await rowAction(page, support, 'Deactivate');
  const confirm = page.getByRole('dialog', { name: 'Deactivate staff member' });
  await expect(confirm).toContainText(`Deactivate ${support} (Finance)?`);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(row(support)).toContainText('ACTIVE');
  await rowAction(page, support, 'Deactivate');
  await confirm.getByRole('button', { name: 'Deactivate' }).click();
  await expect(row(support)).toContainText('DEACTIVATED');
  await page.getByRole('button', { name: 'Log out' }).click();

  await logIn(page, support, 'Finance1234!');
  await expect(
    page.getByText('Invalid email or password, or the account is not active.'),
  ).toBeVisible();
  expect(await page.evaluate('window.e2eSameDocument')).toBe(true);
});

test('after an own password change the session survives a reload (mocks)', async ({ page }) => {
  await page.goto('/');
  await logIn(page, 'support@example.com', 'Admin1234!');
  await page.getByRole('link', { name: 'Profile' }).click();
  const form = page.getByRole('form', { name: 'Change password' });
  await form.getByLabel('Current password').fill('Admin1234!');
  await form.getByRole('textbox', { name: 'New password', exact: true }).fill('Support1234!');
  await form.getByLabel('Confirm new password').fill('Support1234!');
  await form.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Your password has been changed.')).toBeVisible();

  // Expire the access token, so the reload has to refresh with the re-issued cookie.
  await page.evaluate(`(() => {
    const key = 'wallet.staff.session';
    const session = JSON.parse(localStorage.getItem(key));
    session.accessToken = session.accessToken.replace(/^(mock-staff\\.[^.]+\\.)\\d+/, '$11');
    session.accessTokenExpiresAt = new Date(0).toISOString();
    localStorage.setItem(key, JSON.stringify(session));
  })()`);
  await page.reload();
  await expect(page.getByTestId('current-staff')).toHaveText('support@example.com · SUPPORT');
  await expect(page).toHaveURL(/\/profile$/);
});
