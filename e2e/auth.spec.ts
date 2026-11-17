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

test('staff without a permission get No Access on a direct URL and stay signed in (mocks)', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByLabel('Email').fill('support@example.com');
  await page.getByLabel('Password').fill('Admin1234!');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByRole('heading', { name: 'No Access' })).toBeVisible();
  await expect(page.getByTestId('current-staff')).toHaveText('support@example.com · SUPPORT');
  await expect(page.getByRole('link', { name: 'Settings' })).toBeHidden();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'No Access' })).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);

  await page.getByRole('link', { name: 'Go home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Back-office', exact: true })).toBeVisible();
  await expect(page.getByTestId('current-staff')).toHaveText('support@example.com · SUPPORT');
});
