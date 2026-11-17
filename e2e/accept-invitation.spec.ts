import { expect, test } from '@playwright/test';

test('invited staff member sets a password and goes to Login (mocks)', async ({ page }) => {
  await page.goto('/accept-invitation?token=mock-invitation');
  await expect(page.getByRole('heading', { name: 'Accept invitation' })).toBeVisible();

  await page.getByLabel('New password').fill('Invited1234!');
  await page.getByLabel('Confirm password').fill('Invited1234!');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('Your password is set')).toBeVisible();

  await page.getByRole('link', { name: 'Go to login' }).click();
  await expect(page.getByRole('heading', { name: 'Log in to Back-office' })).toBeVisible();
});
