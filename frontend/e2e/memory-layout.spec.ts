import fs from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './harness';

test('memory detail keeps story and interactions side by side on desktop and stacks on phone', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const route = '/albums/fixture-album/memories/fixture-memory';
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    const { width } = viewport;
    await page.setViewportSize(viewport);
    await page.goto(route);
    await expect(page.locator('.memory-detail-heading h1')).toBeVisible();
    await expect(page.locator('.memory-social-panel')).toBeVisible();
    const layout = await page.evaluate(() => {
      const content = document.querySelector('.memory-detail-content')!,
        left = document.querySelector('.memory-detail-left')!.getBoundingClientRect(),
        social = document.querySelector('.memory-social-panel')!.getBoundingClientRect();
      return {
        columns: getComputedStyle(content).gridTemplateColumns,
        left: { x: left.x, y: left.y, width: left.width, height: left.height },
        social: { x: social.x, y: social.y, width: social.width },
        detailBottom: document.querySelector('.memory-detail')!.getBoundingClientRect().bottom,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(layout.overflow, `${width}px horizontal overflow`).toBe(false);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      accessibility.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
      `${width}px serious/critical accessibility violations`,
    ).toEqual([]);
    if (width > 900) {
      expect(layout.columns.trim().split(/\s+/)).toHaveLength(2);
      expect(layout.social.x).toBeGreaterThan(layout.left.x + layout.left.width * 0.7);
      expect(layout.social.y).toBeLessThan(layout.left.y + 20);
      expect(layout.detailBottom, `${width}px detail height`).toBeLessThanOrEqual(viewport.height);
    } else {
      expect(layout.columns.trim().split(/\s+/)).toHaveLength(1);
      expect(layout.social.y).toBeGreaterThanOrEqual(layout.left.y + layout.left.height - 1);
    }
    const directory = path.resolve(`../.qa/phase6/${info.project.name}`);
    await fs.mkdir(directory, { recursive: true });
    await page.screenshot({
      path: path.join(directory, `memory-detail-${width}.png`),
      fullPage: true,
    });
  }
});

test('album down-arrow scrolls to and focuses the memories heading', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/albums/fixture-album');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Cuộn đến phần Những kỷ niệm' }).click();
  const heading = page.getByRole('heading', { name: 'Những kỷ niệm', exact: true });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test('landing keeps its primary content within one screen', async ({ page }, info) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Mở album/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dễ tìm lại khi cần' })).toBeVisible();
    const size = await page.evaluate(() => ({
      page: document.documentElement.scrollHeight,
      viewport: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    const directory = path.resolve(`../.qa/phase6/${info.project.name}`);
    await fs.mkdir(directory, { recursive: true });
    await page.screenshot({
      path: path.join(directory, `landing-${viewport.width}.png`),
      fullPage: true,
    });
    expect(size.overflow, `${viewport.width}px horizontal overflow`).toBe(false);
    expect(size.page, `${viewport.width}px landing height`).toBeLessThanOrEqual(size.viewport);
  }
});
