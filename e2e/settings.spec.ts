import { expect, type Locator, test } from '@playwright/test';

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

test('a long list item fits the editor, the page and its history on a 360 px screen (mocks)', async ({
  page,
}) => {
  const longItem = 'partner-integration-with-a-very-long-product-identifier-2026-q4';
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/settings');

  await page.getByRole('button', { name: 'Add to Enabled products' }).click();
  await page.getByRole('textbox', { name: 'New item for Enabled products' }).fill(longItem);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Enabled products saved')).toBeVisible();

  const label = page
    .getByRole('row')
    .filter({ hasText: 'products.enabled' })
    .locator('.MuiChip-label', { hasText: longItem });
  const box = (await label.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  const clipped = await label.evaluate(
    (element: { scrollWidth: number; clientWidth: number }) =>
      element.scrollWidth - element.clientWidth,
  );
  expect(clipped).toBe(0);
  expect(await page.evaluate('document.documentElement.scrollWidth - innerWidth')).toBe(0);

  await page.getByRole('button', { name: 'History of Enabled products' }).click();
  const latest = page.getByRole('list', { name: 'Changes' }).getByRole('listitem').first();
  await expect(latest).toContainText(longItem);

  const rightEdge = async (locator: Locator) => {
    const box = await locator.boundingBox();
    return box ? box.x + box.width : 0;
  };
  await expect.poll(() => rightEdge(page.locator('.MuiDrawer-paper'))).toBeLessThanOrEqual(360);
  const tokens = await latest.locator('span').all();
  expect(Math.max(...(await Promise.all(tokens.map(rightEdge))))).toBeLessThanOrEqual(360);
  expect(await page.evaluate('document.documentElement.scrollWidth - innerWidth')).toBe(0);
});
