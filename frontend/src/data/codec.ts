import type { Photo, Store } from '../domain/types';
import { dateOnly, text } from '../domain/policy';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export async function checksum(value: Blob | string) {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value).buffer : await value.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
export function decode(value: string) {
  const length = value.length,
    padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0,
    dataEnd = length - padding;
  if (
    !length ||
    length % 4 ||
    (padding === 2 && dataEnd % 4 !== 2) ||
    (padding === 1 && dataEnd % 4 !== 3)
  )
    throw Error('Base64 không hợp lệ.');
  for (let i = 0; i < length; i++) {
    const c = value.charCodeAt(i),
      alphabet =
        (c >= 65 && c <= 90) ||
        (c >= 97 && c <= 122) ||
        (c >= 48 && c <= 57) ||
        c === 43 ||
        c === 47;
    if ((i < dataEnd && !alphabet) || (i >= dataEnd && c !== 61))
      throw Error('Base64 không hợp lệ.');
  }
  const output = new Uint8Array((length / 4) * 3 - padding),
    chunkSize = 65536;
  let offset = 0;
  for (let start = 0; start < length; start += chunkSize) {
    const binary = atob(value.slice(start, Math.min(start + chunkSize, length)));
    for (let i = 0; i < binary.length; i++) output[offset++] = binary.charCodeAt(i);
  }
  return output;
}
export async function preparePhoto(blob: Blob): Promise<Photo> {
  if (
    !(blob instanceof Blob) ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ||
    !blob.size ||
    blob.size > 20 * 1024 * 1024
  )
    throw Error('Chọn ảnh JPEG/PNG/WebP, tối đa 20 MB mỗi ảnh.');
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const valid =
    blob.type === 'image/jpeg'
      ? b[0] === 255 && b[1] === 216
      : blob.type === 'image/png'
        ? [...b.slice(0, 8)].join(',') === '137,80,78,71,13,10,26,10'
        : String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
          String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
  if (!valid) throw Error('Nội dung ảnh không khớp định dạng.');
  let thumbnail: Blob | undefined;
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(blob);
      if (Math.max(bitmap.width, bitmap.height) <= 640) thumbnail = blob;
      else {
        const scale = 640 / Math.max(bitmap.width, bitmap.height),
          canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw Error('Canvas unavailable');
        context.fillStyle = '#fff0f3';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        thumbnail = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(Error('Thumbnail failed'))),
            'image/jpeg',
            0.78,
          ),
        );
      }
    } catch {
      throw Error('Không giải mã hoặc tạo ảnh xem trước được. File có thể đã hỏng.');
    } finally {
      bitmap?.close();
    }
  }
  // Normalize uploads to repository-owned Blob values, independent of file inputs.
  const durable = new Blob([await blob.arrayBuffer()], { type: blob.type });
  const preview =
    thumbnail === blob
      ? durable
      : thumbnail
        ? new Blob([await thumbnail.arrayBuffer()], { type: thumbnail.type })
        : undefined;
  const hash = await checksum(durable);
  return { id: `photo-${hash}`, blob: durable, checksum: hash, thumbnail: preview };
}
export function validateStore(s: Store) {
  if (!s || s.version !== 1) throw Error('Schema backup không được hỗ trợ.');
  const lists = [
    'users',
    'albums',
    'members',
    'invites',
    'memories',
    'photos',
    'comments',
    'reactions',
    'imports',
  ] as const;
  if (Object.keys(s).some((k) => !['version', 'identity', ...lists].includes(k)))
    throw Error('Schema backup có trường ngoài version hiện tại.');
  for (const key of lists)
    if (!Array.isArray(s[key]) || s[key].length > 10000)
      throw Error('Danh sách backup không hợp lệ.');
  function unique(values: string[]) {
    if (values.some((v) => typeof v !== 'string' || !v) || new Set(values).size !== values.length)
      throw Error('ID trùng hoặc không hợp lệ.');
  }
  for (const key of ['users', 'albums', 'invites', 'memories', 'photos', 'comments'] as const)
    unique(s[key].map((x) => x.id));
  unique(s.members.map((x) => JSON.stringify([x.albumId, x.userId])));
  unique(s.reactions.map((x) => JSON.stringify([x.memoryId, x.userId])));
  unique(s.imports.map((x) => x.key));
  unique(s.invites.map((x) => x.token));
  const users = new Set(s.users.map((x) => x.id)),
    albums = new Set(s.albums.map((x) => x.id)),
    memories = new Set(s.memories.map((x) => x.id)),
    photos = new Set(s.photos.map((x) => x.id));
  if (s.identity && !users.has(s.identity)) throw Error('Identity backup không tồn tại.');
  for (const u of s.users) {
    text(u.name, 100, true);
    text(u.email, 200);
    if (Object.keys(u).some((k) => !['id', 'name', 'email'].includes(k)))
      throw Error('Profile có trường không được phép.');
  }
  for (const a of s.albums) {
    text(a.title, 120, true);
    text(a.description, 2000);
    const owners = s.members.filter((m) => m.albumId === a.id && m.role === 'owner');
    if (!users.has(a.ownerId) || owners.length !== 1 || owners[0].userId !== a.ownerId)
      throw Error('Album cần đúng một owner.');
    if (
      a.coverPhotoId &&
      !s.memories.some((m) => m.albumId === a.id && m.photoIds.includes(a.coverPhotoId!))
    )
      throw Error('Cover không thuộc album.');
  }
  for (const m of s.members)
    if (
      !albums.has(m.albumId) ||
      !users.has(m.userId) ||
      !['owner', 'contributor', 'viewer'].includes(m.role)
    )
      throw Error('Membership không hợp lệ.');
  for (const m of s.memories) {
    if (
      !albums.has(m.albumId) ||
      !users.has(m.authorId) ||
      (m.date ? !dateOnly(m.date) : typeof m.dateLabel !== 'string') ||
      !Number.isFinite(m.order) ||
      !Array.isArray(m.photoIds) ||
      !m.photoIds.length ||
      m.photoIds.some((id) => !photos.has(id))
    )
      throw Error('Kỷ niệm hoặc quan hệ ảnh không hợp lệ.');
    text(m.title, 160, true);
    if (m.dateLabel !== undefined) text(m.dateLabel, 200);
    text(m.location, 300);
    text(m.note, 20000);
    if (
      !m.animations ||
      typeof m.animations !== 'object' ||
      Array.isArray(m.animations) ||
      (m.legacy &&
        (typeof m.legacy !== 'object' ||
          Array.isArray(m.legacy) ||
          /"(?:password|session|access_token|refresh_token)"\s*:/i.test(JSON.stringify(m.legacy))))
    )
      throw Error('Migration payload không hợp lệ hoặc có trường nhạy cảm.');
  }
  for (const p of s.photos)
    if (!(p.blob instanceof Blob) || !p.blob.size || !/^[a-f0-9]{64}$/.test(p.checksum))
      throw Error('Ảnh backup không hợp lệ.');
  for (const i of s.invites)
    if (
      !albums.has(i.albumId) ||
      !['contributor', 'viewer'].includes(i.role) ||
      !Number.isFinite(i.expiresAt) ||
      typeof i.revoked !== 'boolean'
    )
      throw Error('Invite không hợp lệ.');
  for (const c of s.comments) {
    if (!memories.has(c.memoryId) || !users.has(c.userId) || typeof c.edited !== 'boolean')
      throw Error('Bình luận không hợp lệ.');
    text(c.text, 5000, true);
  }
  for (const r of s.reactions)
    if (!memories.has(r.memoryId) || !users.has(r.userId) || !['❤️', '😊', '🎉'].includes(r.emoji))
      throw Error('Cảm xúc không hợp lệ.');
  for (const i of s.imports)
    if (!memories.has(i.memoryId) || !/^[a-f0-9]{64}$/.test(i.hash))
      throw Error('Checkpoint không hợp lệ.');
}
export async function serializeBackup(store: Store) {
  validateStore(store);
  const photos = await Promise.all(
    store.photos.map(async (p) => ({
      id: p.id,
      checksum: p.checksum,
      mime: p.blob.type,
      data: encode(new Uint8Array(await p.blob.arrayBuffer())),
    })),
  );
  const data = { ...store, photos };
  return JSON.stringify({
    version: 1,
    manifest: {
      records: store.memories.length,
      photos: photos.length,
      sha256: await checksum(canonical(data)),
    },
    data,
  });
}
export async function parseBackup(raw: string): Promise<Store> {
  if (raw.length > 300 * 1024 * 1024) throw Error('Backup quá lớn.');
  const parsed = JSON.parse(raw);
  if (
    parsed.version !== 1 ||
    !parsed.data ||
    !Array.isArray(parsed.data.photos) ||
    parsed.manifest?.sha256 !== (await checksum(canonical(parsed.data)))
  )
    throw Error('Backup/version/checksum không hợp lệ.');
  if (
    parsed.manifest.records !== parsed.data.memories?.length ||
    parsed.manifest.photos !== parsed.data.photos.length
  )
    throw Error('Manifest count không khớp.');
  const photos: Photo[] = [];
  for (const p of parsed.data.photos) {
    if (
      typeof p.data !== 'string' ||
      p.data.length > 28 * 1024 * 1024 ||
      typeof p.mime !== 'string' ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(p.mime)
    )
      throw Error('Ảnh backup vượt giới hạn/định dạng.');
    const blob = new Blob([decode(p.data)], { type: p.mime });
    const prepared = await preparePhoto(blob);
    if (prepared.checksum !== p.checksum) throw Error('Checksum ảnh không khớp.');
    photos.push({ ...prepared, id: p.id });
  }
  const store: Store = { ...parsed.data, photos };
  validateStore(store);
  return store;
}
