import { test, expect } from './harness';
test('isolated browser persistence and versioned restore preserve Blob content and legacy DB', async ({
  page,
}) => {
  await page.goto('/');
  const summary = await page.evaluate(async () => {
    const modulePath = '/src/data/local/repository.ts',
      fixturePath = '/src/data/local/fixture.ts';
    const { LocalRepository } = await import(modulePath),
      { fixturePhoto } = await import(fixturePath);
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('PhotoGallery', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('metadata');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = old.transaction('metadata', 'readwrite');
    tx.objectStore('metadata').put('synthetic-sentinel', 'untouched');
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    old.close();
    const source = new LocalRepository({ name: 'OurJourney-e2e-source' });
    await source.dispatch('owner', {
      type: 'saveMemory',
      albumId: 'fixture-album',
      draft: {
        title: 'Browser fixture',
        date: '2026-10-30',
        location: 'Demo',
        note: '  Preserve whitespace 🌷\n',
        animations: { gift: true },
      },
      blobs: [fixturePhoto(), fixturePhoto()],
    });
    const raw = await source.exportBackup(),
      restored = new LocalRepository({ name: 'OurJourney-e2e-restored', seed: false });
    await restored.restoreBackup(raw);
    return {
      same: (await restored.exportBackup()) === raw,
      bytes: (await restored.read('owner')).photos[0].blob.size,
    };
  });
  expect(summary.same).toBe(true);
  expect(summary.bytes).toBeGreaterThan(0);
  await page.reload();
  const restored = await page.evaluate(async () => {
    const modulePath = '/src/data/local/repository.ts';
    const { LocalRepository } = await import(modulePath);
    const repo = new LocalRepository({ name: 'OurJourney-e2e-restored', seed: false }),
      state = await repo.read('owner');
    const bitmap = await createImageBitmap(state.photos[0].blob);
    const width = bitmap.width;
    bitmap.close();
    const old = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('PhotoGallery', 1);
      r.onsuccess = () => resolve(r.result);
    });
    const sentinel = await new Promise((resolve) => {
      const r = old.transaction('metadata').objectStore('metadata').get('untouched');
      r.onsuccess = () => resolve(r.result);
    });
    old.close();
    return {
      count: state.memories.length,
      photos: state.photos.length,
      note: state.memories.find((m: { title: string }) => m.title === 'Browser fixture').note,
      width,
      sentinel,
    };
  });
  expect(restored).toEqual({
    count: 2,
    photos: 1,
    note: '  Preserve whitespace 🌷\n',
    width: 2,
    sentinel: 'synthetic-sentinel',
  });
});
