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
