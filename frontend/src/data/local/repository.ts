import type {
  Command,
  Id,
  ImportPlan,
  JourneyRepository,
  MemoryDraft,
  Photo,
  Store,
} from '../../domain/types';
import { dateOnly, requireEdit, requireRole, roleOf, text } from '../../domain/policy';
import {
  canonical,
  checksum,
  parseBackup,
  preparePhoto,
  serializeBackup,
  validateStore,
} from '../codec';
import { emptyStore, fixtureStore } from './fixture';

const newId = () => crypto.randomUUID();
type StoredState = Omit<Store, 'photos'> & { photos: Pick<Photo, 'id' | 'checksum'>[] };
function draft(value: MemoryDraft) {
  if (value.date ? !dateOnly(value.date) : typeof value.dateLabel !== 'string')
    throw Error('Ngày kỷ niệm cần là YYYY-MM-DD hoặc giữ nhãn ngày cũ.');
  if (value.dateLabel !== undefined) text(value.dateLabel, 200);
  if (!value.animations || typeof value.animations !== 'object' || Array.isArray(value.animations))
    throw Error('Hiệu ứng không hợp lệ.');
  return {
    title: text(value.title, 160, true),
    date: value.date,
    dateLabel: value.date ? undefined : value.dateLabel,
    location: text(value.location, 300),
    note: text(value.note, 20000),
    animations: value.animations,
  };
}
function gc(s: Store) {
  const memories = new Set(s.memories.map((m) => m.id)),
    used = new Set(s.memories.flatMap((m) => m.photoIds));
  s.comments = s.comments.filter((c) => memories.has(c.memoryId));
  s.reactions = s.reactions.filter((r) => memories.has(r.memoryId));
  s.imports = s.imports.filter((i) => memories.has(i.memoryId));
  s.photos = s.photos.filter((p) => used.has(p.id));
  for (const a of s.albums)
    if (
      a.coverPhotoId &&
      !s.memories.some((m) => m.albumId === a.id && m.photoIds.includes(a.coverPhotoId!))
    )
      delete a.coverPhotoId;
}
function addPhotos(s: Store, photos: Photo[]) {
  for (const p of photos) if (!s.photos.some((x) => x.id === p.id)) s.photos.push(p);
}
export class LocalRepository implements JourneyRepository {
  private db?: Promise<IDBDatabase>;
  private seed?: Promise<Store>;
  constructor(
    private options: {
      name?: string;
      seed?: boolean;
      beforeWrite?: () => void;
      now?: () => number;
    } = {},
  ) {
    if (options.name && !options.name.startsWith('OurJourney-'))
      throw Error('Database name must use the isolated OurJourney namespace.');
  }
  private open() {
    if (!this.db)
      this.db = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.options.name ?? 'OurJourney-local-v1', 2);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('journey'))
            request.result.createObjectStore('journey');
          if (!request.result.objectStoreNames.contains('photos'))
            request.result.createObjectStore('photos', { keyPath: 'id' });
        };
        request.onerror = () => {
          this.db = undefined;
          reject(request.error);
        };
        request.onblocked = () => {
          this.db = undefined;
          reject(Error('Database đang mở ở tab khác. Đóng tab đó rồi thử lại.'));
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            this.db = undefined;
          };
          resolve(request.result);
        };
      });
    return this.db;
  }
  private async transaction<T>(write: boolean, operation: (state: Store) => T): Promise<T> {
    this.seed ??= this.options.seed === false ? Promise.resolve(emptyStore()) : fixtureStore();
    const seed = await this.seed,
      db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(['journey', 'photos'], write ? 'readwrite' : 'readonly'),
        store = tx.objectStore('journey'),
        photoStore = tx.objectStore('photos');
      let output: T,
        failure: unknown,
        stored: StoredState | undefined,
        legacy: Store | undefined,
        assets: Photo[] = [],
        pending = 2;
      tx.oncomplete = () => resolve(output);
      // tx.error is final on abort; rejecting from the earlier error event hid WebKit's cause.
      tx.onabort = () => {
        const error = failure ?? tx.error;
        reject(
          error instanceof DOMException && error.name === 'QuotaExceededError'
            ? Error('Không đủ dung lượng. Dữ liệu trước lần lưu vẫn được giữ nguyên.')
            : error instanceof DOMException && /Blob\/File/.test(error.message)
              ? Error(
                  'Môi trường trình duyệt này không lưu được ảnh. Hãy dùng cửa sổ thường và giữ bản sao riêng; dữ liệu trước lần lưu không thay đổi.',
                  { cause: error },
                )
              : (error ?? Error('Không thể lưu dữ liệu.')),
        );
      };
      const finish = () => {
        if (--pending !== 0) return;
        try {
          const byId = new Map(assets.map((p) => [p.id, p]));
          const state: Store = stored
            ? {
                ...stored,
                photos: stored.photos.map((descriptor) => {
                  const p = byId.get(descriptor.id);
                  if (!p || p.checksum !== descriptor.checksum)
                    throw Error(
                      'Thiếu ảnh hoặc metadata không khớp. Dừng lưu để giữ dữ liệu hiện có.',
                    );
                  return p;
                }),
              }
            : (legacy ?? structuredClone(seed));
          output = operation(state);
          if (write) {
            validateStore(state);
            this.options.beforeWrite?.();
            for (const p of state.photos) {
              const previous = byId.get(p.id);
              if (previous && previous.checksum !== p.checksum)
                throw Error('Photo ID conflict. Không ghi đè ảnh.');
              if (!previous) photoStore.put(p);
            }
            const live = new Set(state.photos.map((p) => p.id));
            for (const p of assets) if (!live.has(p.id)) photoStore.delete(p.id);
            const metadata: StoredState = {
              ...state,
              photos: state.photos.map((p) => ({ id: p.id, checksum: p.checksum })),
            };
            // v1 'state' is retained as a migration recovery source; no clear/delete.
            store.put(metadata, 'state-v2');
          }
        } catch (e) {
          failure = e;
          tx.abort();
        }
      };
      const request = store.get('state-v2');
      request.onsuccess = () => {
        stored = request.result;
        if (!stored) {
          pending++;
          const old = store.get('state');
          old.onsuccess = () => {
            legacy = old.result;
            finish();
          };
        }
        finish();
      };
      const photoRequest = photoStore.getAll();
      photoRequest.onsuccess = () => {
        assets = photoRequest.result;
        finish();
      };
    });
  }
  private initialized = false;
  private async ready() {
    if (!this.initialized) {
      await this.transaction(true, () => undefined);
      this.initialized = true;
    }
  }
  async identity() {
    await this.ready();
    return this.transaction(false, (s) => ({ active: s.identity, users: s.users }));
  }
  async selectIdentity(userId: Id) {
    await this.ready();
    await this.transaction(true, (s) => {
      if (!s.users.some((u) => u.id === userId)) throw Error('Identity không tồn tại.');
      s.identity = userId;
    });
  }
  async createIdentity(name: string, email: string) {
    await this.ready();
    const id = newId();
    await this.transaction(true, (s) => {
      const display = text(name, 100, true),
        address = text(email, 200, true);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw Error('Email không hợp lệ.');
      s.users.push({ id, name: display, email: address });
      s.identity = id;
    });
    return id;
  }
  async read(actor: Id) {
    await this.ready();
    return this.transaction(false, (s) => {
      if (!s.users.some((u) => u.id === actor)) throw Error('Identity không tồn tại.');
      const albums = new Set(s.members.filter((m) => m.userId === actor).map((m) => m.albumId));
      s.albums = s.albums.filter((a) => albums.has(a.id));
      s.members = s.members.filter((m) => albums.has(m.albumId));
      s.memories = s.memories.filter((m) => albums.has(m.albumId));
      s.invites = s.invites.filter((i) => roleOf(s.members, i.albumId, actor) === 'owner');
      gc(s);
      return s;
    });
  }
  async previewInvite(token: string) {
    await this.ready();
    return this.transaction(false, (s) => {
      const i = s.invites.find((x) => x.token === token);
      if (!i) return { status: 'invalid' as const };
      if (i.revoked) return { status: 'revoked' as const };
      if (i.expiresAt <= (this.options.now?.() ?? Date.now()))
        return { status: 'expired' as const };
      return {
        status: 'active' as const,
        title: s.albums.find((a) => a.id === i.albumId)?.title,
        role: i.role,
        albumId: i.albumId,
      };
    });
  }
  async dispatch(actor: Id, command: Command): Promise<Id | undefined> {
    await this.ready();
    const photos =
      command.type === 'saveMemory' ? await Promise.all(command.blobs.map(preparePhoto)) : [];
    return this.transaction(true, (s) => {
      if (!s.users.some((u) => u.id === actor)) throw Error('Identity không tồn tại.');
      const memory = (id: Id) => {
        const m = s.memories.find((m) => m.id === id);
        if (!m) throw Error('Kỷ niệm không tồn tại.');
        return m;
      };
      const owner = (albumId: Id) => requireRole(s.members, albumId, actor, ['owner']);
      const writeMemory = (id: Id) => {
        const m = memory(id);
        requireRole(s.members, m.albumId, actor, ['owner', 'contributor']);
        return m;
      };
      switch (command.type) {
        case 'createAlbum': {
          const id = newId();
          s.albums.push({
            id,
            ownerId: actor,
            title: text(command.title, 120, true),
            description: text(command.description, 2000),
          });
          s.members.push({ albumId: id, userId: actor, role: 'owner' });
          return id;
        }
        case 'updateAlbum': {
          owner(command.albumId);
          const a = s.albums.find((a) => a.id === command.albumId)!;
          a.title = text(command.title, 120, true);
          a.description = text(command.description, 2000);
          a.coverPhotoId = command.coverPhotoId;
          break;
        }
        case 'deleteAlbum': {
          owner(command.albumId);
          s.albums = s.albums.filter((a) => a.id !== command.albumId);
          s.members = s.members.filter((m) => m.albumId !== command.albumId);
          s.invites = s.invites.filter((i) => i.albumId !== command.albumId);
          s.memories = s.memories.filter((m) => m.albumId !== command.albumId);
          gc(s);
          break;
        }
        case 'saveMemory': {
          requireRole(s.members, command.albumId, actor, ['owner', 'contributor']);
          if (
            !photos.length ||
            photos.length > 50 ||
            photos.reduce((n, p) => n + p.blob.size, 0) > 100 * 1024 * 1024
          )
            throw Error('Chọn 1–50 ảnh, tối đa 100 MB mỗi kỷ niệm.');
          const existing = command.memoryId ? memory(command.memoryId) : undefined;
          if (existing) {
            if (existing.albumId !== command.albumId) throw Error('Album không khớp.');
            requireEdit(s.members, existing, actor);
          }
          const id = existing?.id ?? newId(),
            next = {
              ...existing,
              ...draft(command.draft),
              id,
              albumId: command.albumId,
              authorId: existing?.authorId ?? actor,
              order:
                existing?.order ??
                Math.max(
                  -1,
                  ...s.memories.filter((m) => m.albumId === command.albumId).map((m) => m.order),
                ) + 1,
              photoIds: photos.map((p) => p.id),
            };
          s.memories = [...s.memories.filter((m) => m.id !== id), next];
          addPhotos(s, photos);
          gc(s);
          return id;
        }
        case 'deleteMemory': {
          const m = memory(command.memoryId);
          requireEdit(s.members, m, actor);
          s.memories = s.memories.filter((x) => x.id !== m.id);
          gc(s);
          break;
        }
        case 'reorder': {
          requireRole(s.members, command.albumId, actor, ['owner', 'contributor']);
          if (new Set(command.ids).size !== command.ids.length) throw Error('Thứ tự trùng ID.');
          const targets = command.ids.map(memory);
          for (const m of targets) {
            if (m.albumId !== command.albumId) throw Error('Album không khớp.');
            requireEdit(s.members, m, actor);
          }
          const slots = targets.map((m) => m.order).sort((a, b) => a - b),
            ids = new Set(command.ids),
            positions = s.memories.flatMap((m, i) => (ids.has(m.id) ? [i] : []));
          targets.forEach((m, i) => {
            m.order = slots[i];
          });
          positions.forEach((position, i) => {
            s.memories[position] = targets[i];
          });
          break;
        }
        case 'createInvite': {
          owner(command.albumId);
          if (
            !['contributor', 'viewer'].includes(command.role) ||
            !Number.isFinite(command.expiresAt) ||
            command.expiresAt <= (this.options.now?.() ?? Date.now())
          )
            throw Error('Vai trò/thời hạn không hợp lệ.');
          const token = newId();
          s.invites.push({
            id: token,
            token,
            albumId: command.albumId,
            role: command.role,
            expiresAt: command.expiresAt,
            revoked: false,
          });
          return token;
        }
        case 'revokeInvite': {
          const i = s.invites.find((i) => i.id === command.inviteId);
          if (!i) throw Error('Lời mời không tồn tại.');
          owner(i.albumId);
          i.revoked = true;
          break;
        }
        case 'join': {
          const i = s.invites.find((i) => i.token === command.token);
          if (!i || i.revoked || i.expiresAt <= (this.options.now?.() ?? Date.now()))
            throw Error('Lời mời không hợp lệ, đã hết hạn hoặc thu hồi.');
          if (!s.members.some((m) => m.albumId === i.albumId && m.userId === actor))
            s.members.push({ albumId: i.albumId, userId: actor, role: i.role });
          return i.albumId;
        }
        case 'setRole': {
          owner(command.albumId);
          const m = s.members.find(
            (m) => m.albumId === command.albumId && m.userId === command.userId,
          );
          if (!m || m.role === 'owner' || !['contributor', 'viewer'].includes(command.role))
            throw Error('Không thể đổi quyền owner hoặc thành viên không tồn tại.');
          m.role = command.role;
          break;
        }
        case 'removeMember': {
          const m = s.members.find(
            (m) => m.albumId === command.albumId && m.userId === command.userId,
          );
          if (!m || m.role === 'owner') throw Error('Owner không thể rời album hoặc bị xóa.');
          if (actor !== command.userId) owner(command.albumId);
          s.members = s.members.filter((x) => x !== m);
          break;
        }
        case 'addComment': {
          const m = writeMemory(command.memoryId),
            id = newId();
          s.comments.push({
            id,
            memoryId: m.id,
            userId: actor,
            text: text(command.text, 5000, true),
            edited: false,
          });
          return id;
        }
        case 'editComment': {
          const c = s.comments.find((c) => c.id === command.commentId);
          if (!c) throw Error('Bình luận không tồn tại.');
          writeMemory(c.memoryId);
          if (c.userId !== actor) throw Error('Chỉ tác giả được sửa lời của mình.');
          c.text = text(command.text, 5000, true);
          c.edited = true;
          break;
        }
        case 'deleteComment': {
          const c = s.comments.find((c) => c.id === command.commentId);
          if (!c) throw Error('Bình luận không tồn tại.');
          const m = writeMemory(c.memoryId);
          if (c.userId !== actor && roleOf(s.members, m.albumId, actor) !== 'owner')
            throw Error('Bạn không có quyền xóa bình luận.');
          s.comments = s.comments.filter((x) => x !== c);
          break;
        }
        case 'react': {
          writeMemory(command.memoryId);
          if (!['❤️', '😊', '🎉'].includes(command.emoji)) throw Error('Cảm xúc không hợp lệ.');
          const current = s.reactions.find(
            (r) => r.memoryId === command.memoryId && r.userId === actor,
          );
          s.reactions = s.reactions.filter((r) => r !== current);
          if (current?.emoji !== command.emoji)
            s.reactions.push({ memoryId: command.memoryId, userId: actor, emoji: command.emoji });
          break;
        }
        case 'updateProfile': {
          const u = s.users.find((u) => u.id === actor)!;
          u.name = text(command.name, 100, true);
          u.email = text(command.email, 200, true);
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) throw Error('Email không hợp lệ.');
          break;
        }
      }
      return undefined;
    });
  }
  async importBatch(
    actor: Id,
    plan: ImportPlan,
    batchSize = 20,
    onProgress?: (completed: number, total: number, stage: 'verify' | 'write') => void,
  ) {
    await this.ready();
    if (plan.errors.length || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
      throw Error('Sửa lỗi dry-run trước khi import.');
    const verified = new WeakMap<Blob, Promise<string>>();
    onProgress?.(0, plan.records.length, 'verify');
    for (const [index, r] of plan.records.entries()) {
      const computed = await Promise.all([
        checksum(canonical(r.legacy)),
        ...r.photos.map((p) => {
          if (!verified.has(p.blob)) verified.set(p.blob, checksum(p.blob));
          return verified.get(p.blob)!;
        }),
      ]);
      if (computed[0] !== r.hash) throw Error('Dry-run payload đã thay đổi.');
      if (r.photos.some((p, i) => computed[i + 1] !== p.checksum))
        throw Error('Dry-run photo checksum không khớp.');
      onProgress?.(index + 1, plan.records.length, 'verify');
    }
    let imported = 0,
      skipped = 0;
    onProgress?.(0, plan.records.length, 'write');
    for (let offset = 0; offset < plan.records.length; offset += batchSize) {
      const result = await this.transaction(true, (s) => {
        let added = 0,
          ignored = 0;
        for (const r of plan.records.slice(offset, offset + batchSize)) {
          requireRole(s.members, r.albumId, actor, ['owner']);
          const previous = s.imports.find((i) => i.key === r.key);
          if (previous) {
            const m = s.memories.find((m) => m.id === previous.memoryId);
            if (previous.hash !== r.hash || m?.albumId !== r.albumId || m.authorId !== r.authorId)
              throw Error(
                'Conflict: cùng nguồn/legacy ID nhưng khác nội dung hoặc mapping. Không ghi đè.',
              );
            ignored++;
            continue;
          }
          if (!s.users.some((u) => u.id === r.authorId))
            throw Error('Owner mapping không tồn tại.');
          const id = newId();
          addPhotos(s, r.photos);
          s.memories.push({
            id,
            albumId: r.albumId,
            authorId: r.authorId,
            ...draft(r.draft),
            photoIds: r.photos.map((p) => p.id),
            order: r.order,
            legacy: r.legacy,
          });
          s.imports.push({ key: r.key, hash: r.hash, memoryId: id });
          added++;
        }
        return { added, ignored };
      });
      imported += result.added;
      skipped += result.ignored;
      onProgress?.(Math.min(offset + batchSize, plan.records.length), plan.records.length, 'write');
    }
    return { imported, skipped };
  }
  async exportBackup() {
    await this.ready();
    const state = await this.transaction(false, (s) => s);
    return serializeBackup(state);
  }
  async restoreBackup(raw: string) {
    const restored = await parseBackup(raw);
    await this.ready();
    await this.transaction(true, (s) => {
      for (const key of [
        'users',
        'albums',
        'members',
        'invites',
        'memories',
        'photos',
        'comments',
        'reactions',
        'imports',
      ] as const) {
        const identify = (v: unknown) => {
          const o = v as Record<string, unknown>;
          return key === 'members'
            ? canonical([o.albumId, o.userId])
            : key === 'reactions'
              ? canonical([o.memoryId, o.userId])
              : key === 'imports'
                ? o.key
                : o.id;
        };
        const existing = s[key] as unknown[],
          incoming = restored[key] as unknown[];
        for (const item of incoming) {
          const previous = existing.find((x) => identify(x) === identify(item));
          const compare = (x: unknown) =>
            key === 'photos'
              ? canonical({
                  id: (x as Photo).id,
                  checksum: (x as Photo).checksum,
                  mime: (x as Photo).blob.type,
                  bytes: (x as Photo).blob.size,
                })
              : canonical(x);
          if (previous && compare(previous) !== compare(item))
            throw Error('Restore conflict: dữ liệu hiện có được giữ nguyên.');
          if (!previous) existing.push(item);
        }
      }
      s.identity = restored.identity || s.identity;
    });
  }
}
