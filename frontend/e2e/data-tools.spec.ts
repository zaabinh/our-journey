import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, isolatedContext } from './harness';
import { png } from './fixtures';
test('legacy picker requires mapping; import repeats safely; downloaded backup restores in a fresh browser context', async ({
  page,
  browser,
  browserName,
}) => {
  await page.goto('/albums/fixture-album/settings');
  await page.getByText('Nhập dữ liệu cũ từ file riêng', { exact: true }).click();
  const raw = [
    {
      id: 'synthetic-legacy',
      title: 'Imported story',
      date: 'Everyday, no fixed date',
      location: 'Demo',
      note: '  Preserve this note 🌷\n',
      owner: 'Synthetic owner',
      images: ['synthetic.png'],
      order: 8,
      animations: { heart: true },
      unsupported: { preserved: true },
    },
  ];
  await page.getByLabel(/JSON legacy/).setInputFiles({
    name: 'synthetic-legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(raw)),
  });
  await page.getByRole('button', { name: 'Kiểm tra trước khi nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('mapping owner');
  await expect(
    page.getByRole('button', { name: 'Xác nhận mapping và nhập', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Gán chủ sở hữu: Synthetic owner', { exact: true }).selectOption('owner');
  await page.getByLabel('Chọn các file ảnh tương ứng', { exact: true }).setInputFiles({
    name: 'synthetic.png',
    mimeType: 'image/png',
    buffer: png(100, 80, [89, 13, 34]),
  });
  await page.getByLabel('Ảnh cho: synthetic.png', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Kiểm tra trước khi nhập', exact: true }).click();
  await expect(page.getByText('1 record sẵn sàng; 0 lỗi.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận mapping và nhập', exact: true }).click();
  await expect(page.locator('.data-tools').getByRole('status')).toContainText('Nhập thành công: 1');
  await page.getByRole('button', { name: 'Xác nhận mapping và nhập', exact: true }).click();
  await expect(page.locator('.data-tools').getByRole('status')).toContainText(
    '1 record đã có được bỏ qua',
  );
  await page.goto('/albums/fixture-album');
  await expect(
    page.locator('.album-memory-meta').filter({ hasText: 'Everyday, no fixed date' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Imported story', exact: true }).click();
  await expect(page.getByText('Everyday, no fixed date')).toBeVisible();
  await page.goto('/albums/fixture-album/settings');
  await page.getByText('Nhập dữ liệu cũ từ file riêng', { exact: true }).click();
  await page.getByLabel(/JSON legacy/).setInputFiles({
    name: 'invalid-new-source.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{invalid'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Xác nhận mapping và nhập', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Hồ sơ', exact: true }).click();
  await page.getByText('Sao lưu và phục hồi dữ liệu local', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất bản sao local', exact: true }).click();
  const download = await downloadPromise,
    file = path.resolve('../.qa/phase4/synthetic-backup.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await download.saveAs(file);
  const backup = JSON.parse(await fs.readFile(file, 'utf8'));
  expect(
    backup.data.memories.find((m: { title: string }) => m.title === 'Imported story').legacy
      .unsupported,
  ).toEqual({ preserved: true });
  expect(
    backup.data.memories.find((m: { title: string }) => m.title === 'Imported story'),
  ).toMatchObject({
    date: '',
    dateLabel: 'Everyday, no fixed date',
  });
  const context = await isolatedContext(browser, browserName, new URL(page.url()).origin),
    restored = await context.newPage();
  try {
    await restored.goto('/profile');
    await restored.getByText('Sao lưu và phục hồi dữ liệu local', { exact: true }).click();
    await restored.getByLabel('Chọn bản sao schema mới', { exact: true }).setInputFiles(file);
    await restored.getByRole('button', { name: 'Phục hồi bản sao', exact: true }).click();
    await expect(restored.locator('.data-tools').getByRole('status')).toContainText('Đã phục hồi');
    await restored.goto('/albums/fixture-album');
    await expect(restored.getByRole('link', { name: 'Imported story', exact: true })).toBeVisible();
    await restored.reload();
    await expect(restored.locator('.album-total')).toHaveText('2 kỷ niệm');
  } finally {
    await context.close();
  }
});
test('demo signup/profile persist without password inputs', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Synthetic identity');
  await page.getByLabel('Email demo', { exact: true }).fill('fixture@example.invalid');
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tạo danh tính', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đã tạo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Đến album', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có album', exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel('Danh tính demo', { exact: true }).locator('option:checked'),
  ).toHaveText('Synthetic identity');
  await page.getByRole('link', { name: 'Hồ sơ', exact: true }).click();
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Updated identity');
  await page.getByRole('button', { name: 'Lưu hồ sơ', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Đã lưu hồ sơ');
  await page.reload();
  await expect(page.getByLabel('Tên hiển thị', { exact: true })).toHaveValue('Updated identity');
});
