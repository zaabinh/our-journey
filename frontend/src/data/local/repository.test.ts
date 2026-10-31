// @vitest-environment node
import 'fake-indexeddb/auto';
import { expect, test, vi } from 'vitest';
import { LocalRepository } from './repository';
import { fixturePhoto, fixtureStore } from './fixture';
import { dryRunLegacy } from '../legacy';
import { canonical, checksum, decode, encode, parseBackup, serializeBackup } from '../codec';
import { dateOnly } from '../../domain/policy';
import type { Store } from '../../domain/types';
const create = (options: ConstructorParameters<typeof LocalRepository>[0] = {}) =>
  new LocalRepository({ name: `OurJourney-test-${crypto.randomUUID()}`, ...options });
const draft = {
  title: 'Synthetic memory',
  date: '2026-10-01',
  location: 'Demo garden',
  note: '  Story with Unicode 🌷\n',
  animations: { heart: true, unknownEffect: { duration: 42 } },
};
const save = (repo: LocalRepository, actor = 'owner', albumId = 'fixture-album') =>
  repo.dispatch(actor, {
    type: 'saveMemory',
    albumId,
    draft,
    blobs: [fixturePhoto(), fixturePhoto()],
  });
const rawRecord = (id: string | number = 'legacy-1') => ({
  id,
  ...draft,
  owner: 'legacy-owner',
  order: 7,
  images: ['synthetic.png', 'synthetic.png'],
  unsupported: { keep: true },
});
const plan = (raw = [rawRecord()], owners = { 'legacy-owner': 'owner' }) =>
  dryRunLegacy(JSON.stringify(raw), {
    source: 'synthetic-source',
    albumId: 'fixture-album',
    owners,
    files: { 'synthetic.png': fixturePhoto() },
  });

test('separate namespace, persistence across adapters and serialized concurrent writes', async () => {
  expect(() => new LocalRepository({ name: 'PhotoGallery' })).toThrow(/namespace/);
  const name = `OurJourney-persist-${crypto.randomUUID()}`,
    repo = create({ name });
  await Promise.all([
    repo.dispatch('owner', { type: 'createAlbum', title: 'One', description: '' }),
    repo.dispatch('owner', { type: 'createAlbum', title: 'Two', description: '' }),
  ]);
  const state = await new LocalRepository({ name }).read('owner');
  expect(state.albums).toHaveLength(3);
  expect(state.members.filter((m) => m.role === 'owner')).toHaveLength(3);
});
test('v1 upgrade retains recovery state and metadata changes never rewrite stored photo Blobs', async () => {
  const name = `OurJourney-upgrade-${crypto.randomUUID()}`,
    seed = await fixtureStore();
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('journey');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const tx = old.transaction('journey', 'readwrite');
  tx.objectStore('journey').put(seed, 'state');
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  old.close();
  let photoWrites = 0;
  const original = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (this.name === 'photos') photoWrites++;
    return original.call(this, value, key);
  });
  const repo = new LocalRepository({ name });
  await repo.read('owner');
  expect(photoWrites).toBe(1);
  await repo.dispatch('owner', { type: 'createAlbum', title: 'Metadata only', description: '' });
  await repo.dispatch('owner', { type: 'react', memoryId: 'fixture-memory', emoji: '❤️' });
  await new LocalRepository({ name }).read('owner');
  expect(photoWrites).toBe(1);
  const db = await new Promise<IDBDatabase>((resolve) => {
    const r = indexedDB.open(name, 2);
    r.onsuccess = () => resolve(r.result);
  });
  const legacy = await new Promise<Store>((resolve) => {
    const r = db.transaction('journey').objectStore('journey').get('state');
    r.onsuccess = () => resolve(r.result);
  });
  expect(await checksum(legacy.photos[0].blob)).toBe(seed.photos[0].checksum);
  db.close();
});
test.each(['owner', 'contributor', 'viewer', 'outsider'] as const)(
  'read and create role matrix %s',
  async (actor) => {
    const repo = create();
    expect((await repo.read(actor)).albums).toHaveLength(actor === 'outsider' ? 0 : 1);
    if (actor === 'owner' || actor === 'contributor') expect(await save(repo, actor)).toBeTruthy();
    else await expect(save(repo, actor)).rejects.toThrow(/quyền/);
  },
);
test('contributor can edit own memory only; owner can edit others', async () => {
  const repo = create(),
    id = (await save(repo, 'contributor'))!;
  await expect(
    repo.dispatch('contributor', { type: 'deleteMemory', memoryId: 'fixture-memory' }),
  ).rejects.toThrow(/quyền/);
  await repo.dispatch('owner', {
    type: 'saveMemory',
    memoryId: id,
    albumId: 'fixture-album',
    draft: { ...draft, title: 'Edited by owner' },
    blobs: [fixturePhoto()],
  });
  expect((await repo.read('owner')).memories.find((m) => m.id === id)?.authorId).toBe(
    'contributor',
  );
});
test('date-only, duplicate photo relationships and filtered reorder preserve untouched items', async () => {
  const repo = create(),
    a = (await save(repo))!,
    b = (await save(repo))!;
  await repo.dispatch('owner', {
    type: 'reorder',
    albumId: 'fixture-album',
    ids: [b, 'fixture-memory'],
  });
  const s = await repo.read('owner');
  expect(s.memories.find((m) => m.id === a)?.order).toBe(1);
  expect(s.memories.find((m) => m.id === b)?.order).toBe(0);
  expect(s.memories.find((m) => m.id === a)?.photoIds).toHaveLength(2);
  expect(s.photos).toHaveLength(1);
  expect(s.memories.find((m) => m.id === a)?.note).toBe(draft.note);
  expect(dateOnly('2024-02-29')).toBe(true);
  expect(dateOnly('2026-02-29')).toBe(false);
  await expect(
    repo.dispatch('owner', {
      type: 'saveMemory',
      albumId: 'fixture-album',
      draft: { ...draft, date: '2026-02-30' },
      blobs: [fixturePhoto()],
    }),
  ).rejects.toThrow(/Ngày/);
});
test('base64 decoder handles bounded chunks and rejects invalid characters', () => {
  expect(new TextDecoder().decode(decode('SGVsbG8='))).toBe('Hello');
  const large = 'AAAA'.repeat(16385);
  expect(decode(large)).toHaveLength((large.length / 4) * 3);
  expect(() => decode('YWJj!!==')).toThrow(/Base64/);
});
test('write/quota failure rolls back and keeps old records', async () => {
  let fail = false;
  const repo = create({
    beforeWrite: () => {
      if (fail) throw new DOMException('Full', 'QuotaExceededError');
    },
  });
  await repo.read('owner');
  fail = true;
  await expect(save(repo)).rejects.toThrow(/dung lượng/);
  expect((await repo.read('owner')).memories).toHaveLength(1);
  fail = false;
  expect(await save(repo)).toBeTruthy();
});
test('deleting cover memory clears its album cover while retaining blobs reused elsewhere', async () => {
  const repo = create(),
    second = (await repo.dispatch('owner', {
      type: 'createAlbum',
      title: 'Other album',
      description: '',
    }))!;
  await save(repo, 'owner', second);
  await repo.dispatch('owner', { type: 'deleteMemory', memoryId: 'fixture-memory' });
  const s = await repo.read('owner');
  expect(s.albums.find((a) => a.id === 'fixture-album')?.coverPhotoId).toBeUndefined();
  expect(s.photos).toHaveLength(1);
  expect(s.memories).toHaveLength(1);
});
test('dry-run preserves legacy ID, note, order, unknown fields/effects; import is idempotent', async () => {
  const repo = create(),
    p = await plan();
  expect(p.errors).toEqual([]);
  expect(await repo.importBatch('owner', p)).toEqual({ imported: 1, skipped: 0 });
  expect(await repo.importBatch('owner', p)).toEqual({ imported: 0, skipped: 1 });
  const s = await repo.read('owner'),
    m = s.memories.find((m) => m.legacy)!;
  expect(m.legacy).toEqual(rawRecord());
  expect(m.order).toBe(7);
  expect(m.note).toBe(draft.note);
  expect(m.date).toBe('2026-10-01');
  expect(m.photoIds).toHaveLength(2);
  expect(s.photos).toHaveLength(1);
  const conflict = await plan([{ ...rawRecord(), title: 'Conflicting payload' }]);
  await expect(repo.importBatch('owner', conflict)).rejects.toThrow(/Conflict/);
  expect((await repo.read('owner')).memories).toHaveLength(2);
});
test.each([
  { title: 'missing owner', raw: { ...rawRecord(), owner: undefined } },
  { title: 'non-text date', raw: { ...rawRecord(), date: 20261001 } },
  { title: 'missing file', raw: { ...rawRecord(), images: ['absent.png'] } },
  { title: 'traversal', raw: { ...rawRecord(), images: ['../secret.png'] } },
  { title: 'URL', raw: { ...rawRecord(), images: ['https://example.invalid/private.jpg'] } },
  { title: 'invalid base64', raw: { ...rawRecord(), images: ['data:' + 'image/png;base64,!!=='] } },
  { title: 'sensitive field', raw: { ...rawRecord(), password: 'synthetic-rejected-value' } },
])('dry-run reports $title without writes', async ({ raw }) => {
  const p = await dryRunLegacy(JSON.stringify([raw]), {
    source: 'fixture',
    albumId: 'fixture-album',
    owners: { 'legacy-owner': 'owner' },
    files: { 'synthetic.png': fixturePhoto() },
  });
  expect(p.errors).toHaveLength(1);
  expect(p.records).toHaveLength(0);
});
test('legacy free-text date labels survive import, edits and backup without guessing', async () => {
  const label = 'Ngày nào cũng đi';
  const p = await plan([{ ...rawRecord(), date: label }]);
  expect(p.errors).toEqual([]);
  expect(p.records[0].draft).toMatchObject({ date: '', dateLabel: label });
  const repo = create();
  await repo.read('owner');
  await repo.importBatch('owner', p);
  let imported = (await repo.read('owner')).memories.find((m) => m.legacy)!;
  expect(imported).toMatchObject({ date: '', dateLabel: label, legacy: { date: label } });
  await repo.dispatch('owner', {
    type: 'saveMemory',
    albumId: imported.albumId,
    memoryId: imported.id,
    draft: { ...draft, date: '', dateLabel: imported.dateLabel },
    blobs: [fixturePhoto()],
  });
  imported = (await repo.read('owner')).memories.find((m) => m.id === imported.id)!;
  expect(imported.dateLabel).toBe(label);
  const restored = await parseBackup(await serializeBackup(await repo.read('owner')));
  expect(restored.memories.find((m) => m.id === imported.id)?.dateLabel).toBe(label);
});
test('malformed JSON, duplicate ID conflict, missing-owner explicit mapping and inline images', async () => {
  expect(
    (await dryRunLegacy('{', { source: 'fixture', albumId: 'fixture-album', owners: {} })).errors,
  ).toHaveLength(1);
  expect((await plan([rawRecord(), { ...rawRecord(), title: 'Different' }])).errors).toHaveLength(
    1,
  );
  const blob = fixturePhoto(),
    inline = 'data:' + 'image/png;base64,' + encode(new Uint8Array(await blob.arrayBuffer()));
  const p = await dryRunLegacy(
    JSON.stringify([{ ...rawRecord(), owner: undefined, images: [inline] }]),
    { source: 'fixture', albumId: 'fixture-album', owners: { __unassigned__: 'owner' } },
  );
  expect(p.errors).toEqual([]);
  expect(p.records[0].photos[0].checksum).toBe(await checksum(blob));
});
test('batch checkpoint survives failure and retry skips committed records', async () => {
  let writes = 0,
    fail = false;
  const repo = create({
    beforeWrite: () => {
      if (fail && ++writes === 2) throw Error('Synthetic write failure');
    },
  });
  await repo.read('owner');
  const p = await plan([rawRecord('a'), rawRecord('b'), rawRecord('c')]);
  fail = true;
  await expect(repo.importBatch('owner', p, 1)).rejects.toThrow(/Synthetic/);
  expect((await repo.read('owner')).imports).toHaveLength(1);
  fail = false;
  expect(await repo.importBatch('owner', p, 1)).toEqual({ imported: 2, skipped: 1 });
});
test('reordering imported equal-order records swaps only selected slots and keeps hidden records', async () => {
  const repo = create();
  await repo.importBatch(
    'owner',
    await plan([rawRecord('a'), rawRecord('hidden'), rawRecord('b')]),
  );
  const before = (await repo.read('owner')).memories.filter((m) => m.legacy),
    a = before.find((m) => m.legacy?.id === 'a')!,
    b = before.find((m) => m.legacy?.id === 'b')!;
  await repo.dispatch('owner', { type: 'reorder', albumId: 'fixture-album', ids: [b.id, a.id] });
  const after = (await repo.read('owner')).memories
    .filter((m) => m.legacy)
    .sort((a, b) => a.order - b.order);
  expect(after.map((m) => m.legacy?.id)).toEqual(['b', 'hidden', 'a']);
  expect(after.map((m) => m.order)).toEqual([7, 7, 7]);
});
test('versioned restore into empty DB matches order/records/photos/hash and rejects tampering/conflicts', async () => {
  const source = create();
  await source.importBatch('owner', await plan());
  const raw = await source.exportBackup(),
    target = create({ seed: false });
  await target.restoreBackup(raw);
  expect(await target.exportBackup()).toBe(raw);
  await target.restoreBackup(raw);
  expect(await target.exportBackup()).toBe(raw);
  const state = await target.read('owner');
  expect(state.memories).toHaveLength(2);
  expect(state.photos).toHaveLength(1);
  expect(state.memories.find((m) => m.legacy)?.order).toBe(7);
  const changed = JSON.parse(raw);
  changed.data.memories[0].title = 'Tampered';
  await expect(parseBackup(JSON.stringify(changed))).rejects.toThrow(/checksum/);
  await target.dispatch('owner', {
    type: 'updateAlbum',
    albumId: 'fixture-album',
    title: 'Local changed',
    description: '',
  });
  await expect(target.restoreBackup(raw)).rejects.toThrow(/conflict/);
  expect((await target.read('owner')).albums[0].title).toBe('Local changed');
});
test('restore rejects unsupported version, manifest counts and invalid photo bytes without writes', async () => {
  const source = create(),
    raw = await source.exportBackup(),
    target = create({ seed: false });
  const version = JSON.parse(raw);
  version.version = 2;
  await expect(target.restoreBackup(JSON.stringify(version))).rejects.toThrow(/version/);
  const count = JSON.parse(raw);
  count.manifest.photos++;
  await expect(target.restoreBackup(JSON.stringify(count))).rejects.toThrow(/count/);
  const bad = JSON.parse(raw),
    blob = new Blob(['not an image'], { type: 'image/png' });
  bad.data.photos[0].data = encode(new Uint8Array(await blob.arrayBuffer()));
  bad.data.photos[0].checksum = await checksum(blob);
  bad.manifest.sha256 = await checksum(canonical(bad.data));
  await expect(target.restoreBackup(JSON.stringify(bad))).rejects.toThrow(/định dạng/);
  expect((await target.identity()).users).toHaveLength(0);
});
test('owner is unique, invite expiry/revoke/rejoin and downgrade take effect immediately', async () => {
  let now = 1000;
  const repo = create({ now: () => now });
  await expect(
    repo.dispatch('owner', { type: 'removeMember', albumId: 'fixture-album', userId: 'owner' }),
  ).rejects.toThrow(/Owner/);
  await expect(
    repo.dispatch('owner', {
      type: 'setRole',
      albumId: 'fixture-album',
      userId: 'owner',
      role: 'viewer',
    }),
  ).rejects.toThrow(/owner/);
  const token = (await repo.dispatch('owner', {
    type: 'createInvite',
    albumId: 'fixture-album',
    role: 'contributor',
    expiresAt: 2000,
  }))!;
  await repo.dispatch('outsider', { type: 'join', token });
  await repo.dispatch('outsider', { type: 'join', token });
  expect((await repo.read('owner')).members.filter((m) => m.userId === 'outsider')).toHaveLength(1);
  await repo.dispatch('owner', {
    type: 'setRole',
    albumId: 'fixture-album',
    userId: 'outsider',
    role: 'viewer',
  });
  await expect(save(repo, 'outsider')).rejects.toThrow(/quyền/);
  now = 2000;
  expect((await repo.previewInvite(token)).status).toBe('expired');
  await expect(repo.dispatch('viewer', { type: 'join', token })).rejects.toThrow(/hết hạn/);
  await repo.dispatch('owner', { type: 'revokeInvite', inviteId: token });
  expect((await repo.previewInvite(token)).status).toBe('revoked');
  await repo.dispatch('owner', {
    type: 'removeMember',
    albumId: 'fixture-album',
    userId: 'outsider',
  });
  expect((await repo.read('outsider')).albums).toHaveLength(0);
});
test('comments retain plain text and authorship; reaction toggle/replace remains unique', async () => {
  const repo = create(),
    commentId = (await repo.dispatch('contributor', {
      type: 'addComment',
      memoryId: 'fixture-memory',
      text: '<img src=x onerror=alert(1)> 🌷',
    }))!;
  await expect(
    repo.dispatch('owner', { type: 'editComment', commentId, text: 'Owner edit' }),
  ).rejects.toThrow(/tác giả/);
  await repo.dispatch('contributor', { type: 'editComment', commentId, text: '<b>Unicode 🌷</b>' });
  expect((await repo.read('owner')).comments[0].edited).toBe(true);
  for (const emoji of ['❤️', '😊', '😊'] as const)
    await repo.dispatch('contributor', { type: 'react', memoryId: 'fixture-memory', emoji });
  expect((await repo.read('owner')).reactions).toHaveLength(0);
  await expect(
    repo.dispatch('viewer', { type: 'addComment', memoryId: 'fixture-memory', text: 'No' }),
  ).rejects.toThrow(/quyền/);
  await repo.dispatch('owner', { type: 'deleteComment', commentId });
  expect((await repo.read('owner')).comments).toHaveLength(0);
});
