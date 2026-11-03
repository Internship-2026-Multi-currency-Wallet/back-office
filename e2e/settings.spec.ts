import { expect, test } from '@playwright/test';

test('staff change a setting in place, see it in the history and reset it (mocks)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: /Settings/ })).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: 'auth.googleLogin' });
  const toggle = page.getByRole('switch', { name: 'Google sign-in' });
  await expect(row).toContainText('Default');
  await expect(toggle).toBeChecked();

  await toggle.click();
  await expect(page.getByText('Google sign-in saved')).toBeVisible();
  await expect(row).toContainText('Overridden');
  await expect(toggle).not.toBeChecked();

  await page.getByRole('button', { name: 'History of Google sign-in' }).click();
  const latest = page.getByRole('list', { name: 'Changes' }).getByRole('listitem').first();
  await expect(latest).toContainText('staff #100');
  await expect(latest.getByTestId('change-values')).toHaveText('On→Off');
  await page.getByRole('button', { name: 'Close history' }).click();

  await page.getByRole('button', { name: 'Reset to default: Google sign-in' }).click();
  await expect(row).toContainText('Default');
  await expect(toggle).toBeChecked();
});
