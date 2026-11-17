import { expect, test } from '@playwright/test';

test('staff log in, stay signed in after a reload and log out (mocks)', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Log in to Back-office' })).toBeVisible();

  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('Wrong1234!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid email or password');

  await page.getByLabel('Password').fill('Admin1234!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('current-staff')).toHaveText('admin@example.com · ADMIN');
  await expect(page).toHaveURL(/\/settings$/);

  await page.reload();
  await expect(page.getByTestId('current-staff')).toHaveText('admin@example.com · ADMIN');
  await expect(page.getByText('Google sign-in')).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('heading', { name: 'Log in to Back-office' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Log in to Back-office' })).toBeVisible();
});
