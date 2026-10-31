import { test, expect } from './harness';
test('fixture shell and deep-link fallback', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Demo local/)).toBeVisible();
  await page.goto('/missing');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
});
for (const width of [390, 768, 1440]) {
  test(`component keyboard and layout ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('link', { name: 'Album', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Album', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('button', { name: 'Tạo album' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Tên album').fill('Album tổng hợp');
    await page.screenshot({ path: `../.qa/phase2/dialog-${width}.png`, fullPage: true });
    const navigationPrompt = page.waitForEvent('dialog');
    await page.evaluate(() => history.back());
    await (await navigationPrompt).dismiss();
    await expect(page.getByRole('dialog')).toBeVisible();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Tên album').fill('');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tạo album' })).toBeFocused();
    expect(await page.locator('.skip-link').evaluate((el) => getComputedStyle(el).clipPath)).toBe(
      'inset(50%)',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `../.qa/phase2/albums-${width}.png`, fullPage: true });
  });
}
