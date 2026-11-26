import { test, expect } from './harness';
import { png } from './fixtures';

test('dropped photos and reordered additions survive saving and reloading', async ({ page }) => {
  const first = png(24, 24, [150, 20, 50]);
  const second = png(48, 24, [20, 100, 50]);
  const added = png(90, 24, [80, 20, 150]);
  await page.goto('/albums/fixture-album');
  await page.getByRole('button', { name: 'Thêm kỷ niệm', exact: true }).click();
  await page.evaluate(
    (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], 'first.png', { type: 'image/png' }));
      const zone = document.querySelector('.memory-drop-zone')!;
      zone.dispatchEvent(
        new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }),
      );
      zone.dispatchEvent(
        new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
      );
    },
    [...first],
  );
  await expect(page.locator('.upload-preview')).toHaveCount(1);
  await page
    .getByLabel(/Ảnh JPEG/)
    .setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: second });
  await expect(page.locator('.upload-preview')).toHaveCount(2);
  await page.getByLabel('Tiêu đề', { exact: true }).fill('Kéo thả ảnh');
  await page.getByLabel('Ngày kỷ niệm', { exact: true }).fill('2026-10-30');
  await page.getByRole('button', { name: 'Lưu kỷ niệm', exact: true }).click();
  await page.getByRole('link', { name: 'Kéo thả ảnh', exact: true }).click();
  const memoryUrl = page.url();
  await page.getByRole('button', { name: 'Sửa kỷ niệm', exact: true }).click();
  await page
    .getByLabel(/Ảnh JPEG/)
    .setInputFiles({ name: 'added.png', mimeType: 'image/png', buffer: added });
  await expect(page.locator('.upload-preview')).toHaveCount(3);
  await page.locator('.photo-drag-handle').last().dragTo(page.locator('.upload-preview').first());
  await expect
    .poll(() =>
      page
        .locator('.upload-preview img')
        .first()
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(90);
  await page.getByRole('button', { name: 'Lưu kỷ niệm', exact: true }).click();
  await page.goto(memoryUrl);
  await page.getByRole('button', { name: 'Xem ảnh 1', exact: true }).click();
  await expect
    .poll(() =>
      page.locator('.photo-full').evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(90);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Sửa kỷ niệm', exact: true }).click();
  await page.getByRole('button', { name: 'Ảnh 1 xuống sau', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu kỷ niệm', exact: true }).click();
  await page.goto(memoryUrl);
  await page.getByRole('button', { name: 'Xem ảnh 1', exact: true }).click();
  await expect
    .poll(() =>
      page.locator('.photo-full').evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(24);
});
