import fs from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './harness';
import { png } from './fixtures';
const memory = '/albums/fixture-album/memories/fixture-memory';
const routes = [
  '/',
  '/login',
  '/signup',
  '/profile',
  '/albums',
  '/albums/fixture-album',
  memory,
  '/albums/fixture-album/settings',
  '/join/invalid-demo',
  '/missing',
];
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];
for (const viewport of viewports) {
  test(`routes fit ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    const scans = [];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      if (route === '/')
        await expect(page.getByLabel('Danh tính demo', { exact: true })).toHaveCount(0);
      else await expect(page.getByLabel('Danh tính demo', { exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (route.startsWith('/join')) await expect(page.getByRole('alert')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        route,
      ).toBe(true);
      const small = await page.locator('button, .button, nav a').evaluateAll((elements) =>
        elements
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
          })
          .map((el) => el.textContent),
      );
      expect(small, route).toEqual([]);
      const slug = route.replaceAll('/', '-') || 'home';
      if ([390, 768, 1440].includes(viewport.width))
        await page.screenshot({
          path: `../.qa/phase6/${info.project.name}/${viewport.width}/${slug}.png`,
          fullPage: true,
        });
      if ([390, 1440].includes(viewport.width)) {
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        scans.push({
          route,
          violations: result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            targets: v.nodes.map((n) => n.target),
          })),
        });
        expect(
          result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
          route,
        ).toEqual([]);
      }
    }
    const output = path.resolve(`../.qa/phase6/${info.project.name}/${viewport.width}/axe.json`);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(scans, null, 2));
  });
}
test('keyboard, short dialog viewport, zoom 200 percent and reduced motion', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto('/albums');
  await page.getByRole('button', { name: 'Tạo album', exact: true }).click();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.getByLabel('Tên album', { exact: true }).fill('Keyboard fixture');
  await page.getByRole('button', { name: 'Lưu album', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Lưu album', exact: true })).toBeInViewport();
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
  await page.screenshot({
    path: `../.qa/phase6/${info.project.name}/dialog-short.png`,
    fullPage: true,
  });
  page.once('dialog', (d) => d.accept());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Tạo album', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ['/albums', memory, '/profile', '/albums/fixture-album/settings']) {
    await page.goto(route);
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `zoom ${route}`,
    ).toBe(true);
  }
  await page.screenshot({
    path: `../.qa/phase6/${info.project.name}/zoom-200.png`,
    fullPage: true,
  });
  await page.goto(memory);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Xem hiệu ứng trái tim', exact: true }).click();
  expect(await page.locator('.effect').evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'none',
  );
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.press('Tab');
  // Dedicated skip-link keyboard activation; focus is explicit to remove browser tab-order restoration differences.
  await page.locator('.skip-link').focus();
  await expect(page.locator('.skip-link')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});
test('page entry and card hover stay subtle and follow reduced-motion preference', async ({
  page,
}) => {
  await page.goto('/albums');
  const pageContent = page.locator('.page-transition');
  await expect(pageContent).toHaveCSS('animation-name', 'page-arrive');
  const cardLink = page.getByRole('link', { name: 'Những ngày bên nhau' });
  await cardLink.hover();
  await expect(cardLink.locator('..')).toHaveCSS('transform', /matrix/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(pageContent).toHaveCSS('animation-name', 'none');
  await expect(cardLink.locator('..')).toHaveCSS('transition-duration', '0s');
});
test('200 memories stay paginated; thumbnails are bounded and every object URL is revoked on navigation', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const create = URL.createObjectURL,
      revoke = URL.revokeObjectURL,
      live = new Set<string>(),
      metrics = { created: 0, revoked: 0, live: 0 };
    Reflect.set(window, 'urlMetrics', metrics);
    URL.createObjectURL = function (blob) {
      const url = create.call(URL, blob);
      live.add(url);
      metrics.created++;
      metrics.live = live.size;
      return url;
    };
    URL.revokeObjectURL = function (url) {
      if (live.delete(url)) metrics.revoked++;
      metrics.live = live.size;
      revoke.call(URL, url);
    };
  });
  await page.goto('/albums');
  await page.getByRole('button', { name: 'Tạo album', exact: true }).click();
  await page.getByLabel('Tên album', { exact: true }).fill('Large synthetic album');
  await page.getByRole('button', { name: 'Lưu album', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Large synthetic album', exact: true }).click();
  const albumUrl = page.url();
  await page.getByRole('link', { name: 'Cài đặt album', exact: true }).click();
  await page.getByText('Nhập dữ liệu cũ từ file riêng', { exact: true }).click();
  const records = Array.from({ length: 200 }, (_, i) => ({
    id: `fixture-${i}`,
    title: `Grid fixture ${String(i).padStart(3, '0')}`,
    date: '2026-10-30',
    location: 'Demo',
    note: 'Synthetic story',
    owner: 'Fixture owner',
    images: ['fixture.png'],
    order: i,
  }));
  await page.getByLabel(/JSON legacy/).setInputFiles({
    name: 'synthetic-200.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(records)),
  });
  await page.getByLabel('Gán chủ sở hữu: Fixture owner', { exact: true }).selectOption('owner');
  await page.getByLabel('Chọn các file ảnh tương ứng', { exact: true }).setInputFiles({
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: png(1600, 1200, [182, 70, 95]),
  });
  await page.getByLabel('Ảnh cho: fixture.png', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Kiểm tra trước khi nhập', exact: true }).click();
  await expect(page.getByText('200 record sẵn sàng; 0 lỗi.', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Xác nhận mapping và nhập', exact: true }).click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.locator('.data-tools').getByRole('status')).toContainText('Đã nhập 200', {
    timeout: 30000,
  });
  await page.goto(albumUrl);
  await expect(page.locator('.album-total')).toHaveText('200 kỷ niệm');
  await expect(page.locator('.card')).toHaveCount(12);
  await expect
    .poll(() =>
      page
        .locator('.photo-thumb')
        .first()
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBe(640);
  expect(await page.evaluate(() => Reflect.get(window, 'urlMetrics').live)).toBeLessThanOrEqual(12);
  await page.getByRole('button', { name: 'Xem thêm kỷ niệm', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(24);
  expect(await page.evaluate(() => Reflect.get(window, 'urlMetrics').live)).toBeLessThanOrEqual(24);
  await page.getByRole('link', { name: 'Grid fixture 000', exact: true }).click();
  await page.getByRole('button', { name: 'Xem ảnh 1', exact: true }).click();
  await expect
    .poll(() => page.locator('.photo-full').evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(1600);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Hồ sơ', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'urlMetrics').live)).toBe(0);
  const metrics = await page.evaluate(() => Reflect.get(window, 'urlMetrics'));
  expect(metrics.revoked).toBe(metrics.created);
});
test('image load failure and long Unicode content stay readable', async ({ page }) => {
  await page.addInitScript(() => {
    URL.createObjectURL = function () {
      return 'blob:synthetic-invalid';
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/albums');
  await expect(page.getByText('Không tải được ảnh', { exact: true })).toBeVisible();
  await page.goto(memory);
  await page
    .getByLabel('Bình luận mới', { exact: true })
    .fill('Một câu chuyện dài 🌷 '.repeat(150));
  await page.getByRole('button', { name: 'Đăng bình luận', exact: true }).click();
  await expect(page.locator('.comment-text')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
