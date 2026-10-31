import { test, expect } from './harness';
import { png } from './fixtures';
test('stored original and preview decode after reload, including in WebKit persistent mode', async ({
  page,
}) => {
  await page.goto('/albums/fixture-album');
  await page.getByRole('button', { name: 'Thêm kỷ niệm', exact: true }).click();
  await page.getByLabel(/Ảnh JPEG/).setInputFiles({
    name: 'synthetic.png',
    mimeType: 'image/png',
    buffer: png(1600, 1200, [182, 70, 95]),
  });
  await page.getByLabel('Tiêu đề', { exact: true }).fill('Stored image fixture');
  await page.getByRole('button', { name: 'Lưu kỷ niệm', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Stored image fixture', exact: true }).click();
  await page.reload();
  await expect(page.locator('main h1')).toHaveText('Stored image fixture');
  const media = await page.evaluate(async () => {
    const repositoryPath = '/src/data/local/repository.ts',
      codecPath = '/src/data/codec.ts';
    const { LocalRepository } = await import(repositoryPath),
      { checksum } = await import(codecPath);
    const s = await new LocalRepository().read('owner'),
      m = s.memories.find((m: { title: string }) => m.title === 'Stored image fixture'),
      p = s.photos.find((p: { id: string }) => p.id === m.photoIds[0]);
    const result: Record<string, unknown> = {
      bytes: p.blob.size,
      mime: p.blob.type,
      isBlob: p.blob instanceof Blob,
      isFile: p.blob instanceof File,
      thumbnailBytes: p.thumbnail?.size,
    };
    try {
      result.checksumMatches = (await checksum(p.blob)) === p.checksum;
      result.actualBytes = (await p.blob.arrayBuffer()).byteLength;
    } catch (e) {
      result.readError = String(e);
    }
    try {
      const b = await createImageBitmap(p.blob);
      result.original = b.width;
      b.close();
    } catch (e) {
      result.originalError = String(e);
    }
    try {
      const t = await createImageBitmap(p.thumbnail);
      result.thumbnail = t.width;
      t.close();
    } catch (e) {
      result.thumbnailError = String(e);
    }
    return result;
  });
  console.log('Synthetic stored media probe', media);
  expect(media.checksumMatches).toBe(true);
  expect(media.original).toBe(1600);
  expect(media.thumbnail).toBe(640);
  await page.getByRole('button', { name: 'Xem ảnh 1', exact: true }).click();
  await expect
    .poll(() => page.locator('.photo-full').evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(1600);
});
