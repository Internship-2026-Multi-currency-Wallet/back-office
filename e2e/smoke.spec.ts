import { expect, test } from '@playwright/test';

test('home shows wallet-core health and the staff dev user (mocks)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('health')).toContainText('Connected to wallet-core: wallet-core');
  await expect(page.getByTestId('me')).toContainText('Dev user: 100');
});

test('users page shows the DataGrid', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.getByRole('grid')).toContainText('olena@example.com');
});

test('unknown URLs show the 404 page', async ({ page }) => {
  await page.goto('/nope');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
