import { expect, test } from '@playwright/test';

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
