import { test, expect } from './harness';
import { png } from './fixtures';
const photo = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0,
  0, 253, 212, 154, 115, 0, 0, 0, 22, 73, 68, 65, 84, 120, 156, 99, 216, 230, 22, 255, 231, 201, 19,
  134, 72, 94, 165, 44, 57, 57, 0, 46, 28, 5, 78, 128, 202, 88, 149, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]);
test('album → multi-photo memory → reload → search/edit/reorder → cancel/confirm delete', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/albums');
  await page.getByRole('button', { name: 'Tạo album', exact: true }).click();
  await page.getByLabel('Tên album', { exact: true }).fill('E2E album');
  await page.getByRole('button', { name: 'Lưu album', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'E2E album', exact: true }).click();
  const albumUrl = page.url();
  for (const title of ['Target one', 'Keep hidden', 'Target two']) {
    await page.getByRole('button', { name: 'Thêm kỷ niệm', exact: true }).click();
    await page.getByLabel(/Ảnh JPEG/).setInputFiles([
      { name: 'a.png', mimeType: 'image/png', buffer: photo },
      { name: 'b.png', mimeType: 'image/png', buffer: png(100, 160, [182, 70, 95]) },
    ]);
    await expect(page.getByRole('button', { name: 'Lưu kỷ niệm', exact: true })).toBeEnabled();
    await page.getByLabel('Tiêu đề', { exact: true }).fill(title);
    await page.getByLabel('Ngày kỷ niệm', { exact: true }).fill('2026-10-30');
    await page.getByLabel('Địa điểm', { exact: true }).fill('Garden fixture');
    await page
      .getByLabel('Câu chuyện', { exact: true })
      .fill('**Story** <img src=x onerror=alert(1)> 🌷');
    await page.getByRole('button', { name: 'Lưu kỷ niệm', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.reload();
  await expect(page.locator('.album-total')).toHaveText('3 kỷ niệm');
  await page.getByText('Tìm & sắp xếp', { exact: true }).click();
  await page.getByLabel('Tìm kỷ niệm', { exact: true }).fill('Target');
  await page.getByRole('button', { name: 'Đưa Target two lên trước', exact: true }).click();
  await page.getByLabel('Tìm kỷ niệm', { exact: true }).fill('');
  await expect(page.locator('.album-memory-title')).toHaveText([
    'Target two',
    'Keep hidden',
    'Target one',
  ]);
  await page.getByRole('link', { name: 'Target one', exact: true }).click();
  const deepLink = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Target one', exact: true })).toBeVisible();
  await expect(page.locator('.memory-detail-content')).toHaveCSS(
    'grid-template-columns',
    /\S+\s+\S+/,
  );
  await expect(page.locator('.memory-social-panel')).toBeVisible();
  await expect(page.locator('.memory-story strong')).toHaveText('Story');
  await expect(page.locator('.memory-story img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Xem ảnh 1', exact: true }).click();
  await expect(page.getByText('Ảnh 1 / 2', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator('.photo-full').evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(2);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Ảnh 2 / 2', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator('.photo-full').evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(100);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Xem ảnh 1', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Sửa kỷ niệm', exact: true }).click();
  await page.getByLabel('Tiêu đề', { exact: true }).fill('Edited target');
  await page.getByRole('button', { name: 'Ảnh 2 lên trước', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu kỷ niệm', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto(deepLink);
  await expect(page.getByRole('heading', { name: 'Edited target', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xem ảnh 1', exact: true }).click();
  await expect
    .poll(() => page.locator('.photo-full').evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(100);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Xóa kỷ niệm', exact: true }).click();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edited target', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xóa kỷ niệm', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await expect(page).toHaveURL(albumUrl);
  await expect(page.locator('.album-total')).toHaveText('2 kỷ niệm');
  await expect(page.getByRole('link', { name: 'Keep hidden', exact: true })).toBeVisible();
});
test('invalid image keeps form input; profile identity switch has a discard guard', async ({
  page,
}) => {
  await page.goto('/albums/fixture-album');
  await page.getByRole('button', { name: 'Thêm kỷ niệm', exact: true }).click();
  await page.getByLabel('Tiêu đề', { exact: true }).fill('Retain this input');
  await page.getByLabel(/Ảnh JPEG/).setInputFiles({
    name: 'bad.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid image'),
  });
  await expect(page.getByRole('alert')).toContainText('định dạng');
  await expect(page.getByLabel('Tiêu đề', { exact: true })).toHaveValue('Retain this input');
  page.once('dialog', (d) => d.accept());
  await page.keyboard.press('Escape');
  await page.goto('/profile');
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Unsaved name');
  page.once('dialog', (d) => d.dismiss());
  await page.getByLabel('Danh tính demo', { exact: true }).selectOption('viewer');
  await expect(page.getByLabel('Danh tính demo', { exact: true })).toHaveValue('owner');
  await expect(page.getByLabel('Tên hiển thị', { exact: true })).toHaveValue('Unsaved name');
});
test('quota write failure retains form and retry saves exactly once', async ({ page }) => {
  await page.goto('/albums/fixture-album');
  await page.getByRole('button', { name: 'Thêm kỷ niệm', exact: true }).click();
  await page
    .getByLabel(/Ảnh JPEG/)
    .setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: photo });
  await page.getByLabel('Tiêu đề', { exact: true }).fill('Quota retry fixture');
  await page.getByLabel('Câu chuyện', { exact: true }).fill('Keep this story');
  await page.evaluate(() => {
    Reflect.set(window, 'syntheticQuota', true);
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'journey' && Reflect.get(window, 'syntheticQuota'))
        throw new DOMException('Synthetic quota', 'QuotaExceededError');
      return original.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: 'Lưu kỷ niệm', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Không đủ dung lượng');
  await expect(page.getByLabel('Tiêu đề', { exact: true })).toHaveValue('Quota retry fixture');
  await expect(page.getByLabel('Câu chuyện', { exact: true })).toHaveValue('Keep this story');
  await page.evaluate(() => Reflect.set(window, 'syntheticQuota', false));
  await page.getByRole('button', { name: 'Lưu kỷ niệm', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.album-total')).toHaveText('2 kỷ niệm');
  await expect(page.getByRole('link', { name: 'Quota retry fixture', exact: true })).toHaveCount(1);
});
