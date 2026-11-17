import { expect, test } from '@playwright/test';

// The mocks live in the page: stay in one document (no reload), or the invitation is fresh again.
test('invited staff member sets a password, logs in with it and cannot reuse the link (mocks)', async ({
  page,
}) => {
  await page.goto('/accept-invitation?token=mock-invitation');
  await page.getByLabel('New password').fill('Invited1234!');
  await page.getByLabel('Confirm password').fill('Invited1234!');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('Your password is set')).toBeVisible();

  await page.getByRole('link', { name: 'Go to login' }).click();
  await page.getByLabel('Email').fill('invited@example.com');
  await page.getByLabel('Password').fill('Invited1234!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('current-staff')).toHaveText('invited@example.com · SUPPORT');

  await page.goBack();
  await expect(page).toHaveURL(/\/accept-invitation\?token=mock-invitation$/);
  await page.getByLabel('New password').fill('Another1234!');
  await page.getByLabel('Confirm password').fill('Another1234!');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'This invitation link is invalid, already used or expired.',
  );
});
