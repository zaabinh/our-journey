import type {
  Command,
  Emoji,
  Id,
  JourneyRepository,
  MemberRole,
  Role,
  Store,
  User,
} from '../../domain/types';

type ApiUser = {
  id: string;
  email: string;
  username?: string;
  display_name: string;
  avatar_photo_id?: string;
};
type AlbumDto = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  version: number;
  role: Role;
  cover_photo_id?: string;
};
type MemoryDto = {
  id: string;
  album_id: string;
  author_id: string;
  title: string;
  date: string | null;
  date_label?: string | null;
  location: string;
  note: string;
  position: number;
  version: number;
  published: boolean;
  animations: Record<string, unknown>;
};
type Page<T> = { items: T[]; next_cursor: string | null };
type InviteDto = { id: string; role: MemberRole; expires_at: string; revoked: boolean };
type MemberDto = { user_id: string; display_name: string; role: Role };
type CommentDto = {
  id: string;
  memory_id: string;
  author_id: string;
  body: string;
  edited: boolean;
  version: number;
};
type ReactionDto = { user_id: string; kind: string };
type PhotoDto = { id: string; checksum: string };

const empty = (identity = ''): Store => ({
  version: 1,
  identity,
  users: [],
  albums: [],
  members: [],
  invites: [],
  memories: [],
  photos: [],
  comments: [],
  reactions: [],
  imports: [],
});
const emojiByKind: Record<string, Emoji> = { heart: '❤️', like: '❤️', happy: '😊', wow: '🎉' };
const kindByEmoji: Record<Emoji, string> = { '❤️': 'heart', '😊': 'happy', '🎉': 'wow' };

export class HttpRepository implements JourneyRepository {
  readonly mode = 'remote' as const;
  private csrf = '';
  private current?: Store;
  private inviteSecrets = new Map<string, { token: string; code: string }>();

  private async request<T>(path: string, init: RequestInit = {}, csrfRequired = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData))
      headers.set('Content-Type', 'application/json');
    if (
      csrfRequired &&
      init.method &&
      !['GET', 'HEAD', 'OPTIONS'].includes(init.method.toUpperCase())
    ) {
      if (!this.csrf)
        this.csrf = (await this.request<{ csrf_token: string }>('/auth/csrf')).csrf_token;
      headers.set('X-CSRF-Token', this.csrf);
    }
    const response = await fetch(`/api/v1${path}`, {
      ...init,
      headers,
      credentials: 'same-origin',
    });
    if (!response.ok) {
      let message = `Request failed (${response.status}).`;
      try {
        message = (await response.json()).error?.message ?? message;
      } catch {
        /* no JSON body */
      }
      throw new Error(message);
    }
    return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
  }

  private async all<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | null = null;
    do {
      const separator = path.includes('?') ? '&' : '?';
      const result: Page<T> = await this.request<Page<T>>(
        `${path}${separator}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      items.push(...result.items);
      cursor = result.next_cursor;
    } while (cursor);
    return items;
  }

  async login(identifier: string, password: string) {
    const result = await this.request<{ user: ApiUser; csrf_token: string }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ identifier, password }) },
      false,
    );
    this.csrf = result.csrf_token;
  }
  async register(input: {
    email: string;
    username: string;
    display_name: string;
    password: string;
  }) {
    await this.request('/auth/register', { method: 'POST', body: JSON.stringify(input) }, false);
  }
  async verifyEmail(token: string) {
    return this.request(
      '/auth/verify-email',
      { method: 'POST', body: JSON.stringify({ token }) },
      false,
    );
  }
  async resendVerification(email: string) {
    return this.request(
      '/auth/resend-verification',
      { method: 'POST', body: JSON.stringify({ email }) },
      false,
    );
  }
  async requestPasswordReset(email: string) {
    return this.request(
      '/auth/password-reset/request',
      { method: 'POST', body: JSON.stringify({ email }) },
      false,
    );
  }
  async resetPassword(token: string, password: string) {
    return this.request(
      '/auth/password-reset/confirm',
      { method: 'POST', body: JSON.stringify({ token, password }) },
      false,
    );
  }
  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.csrf = '';
    this.current = undefined;
    this.inviteSecrets.clear();
  }
  async uploadAvatar(file: Blob) {
    const form = new FormData();
    form.append('file', file, 'avatar');
    return this.request('/users/me/avatar', { method: 'POST', body: form });
  }
  async deleteAvatar() {
    return this.request('/users/me/avatar', { method: 'DELETE' });
  }

  async identity() {
    const { user } = await this.request<{ user: ApiUser }>('/auth/session');
    return {
      active: user.id,
      users: [{ id: user.id, name: user.display_name, email: user.email }],
    };
  }
  async selectIdentity() {
    throw new Error('Identity switching is unavailable for signed-in accounts.');
  }
  async createIdentity(): Promise<Id> {
    throw new Error('Create an account to continue.');
  }

  async read(actor: Id): Promise<Store> {
    const { user: apiUser } = await this.request<{ user: ApiUser }>('/auth/session');
    const state = empty(actor);
    const user: User = {
      id: apiUser.id,
      name: apiUser.display_name,
      email: apiUser.email,
      avatarPhotoId: apiUser.avatar_photo_id,
    };
    state.users.push(user);
    if (user.avatarPhotoId) {
      const avatar = await this.request<{ url: string }>(`/photos/${user.avatarPhotoId}/read-url`);
      state.photos.push({
        id: user.avatarPhotoId,
        blob: new Blob(),
        checksum: '',
        src: avatar.url,
      });
    }

    const albums = await this.all<AlbumDto>('/albums');
    state.albums = albums.map((a) => ({
      id: a.id,
      ownerId: a.owner_id,
      title: a.title,
      description: a.description,
      coverPhotoId: a.cover_photo_id,
      version: a.version,
      role: a.role,
    }));
    const names = new Map<string, string>([[user.id, user.name]]);

    for (const album of state.albums) {
      const members = await this.request<{ items: MemberDto[] }>(`/albums/${album.id}/members`);
      state.members.push(
        ...members.items.map((m) => {
          names.set(m.user_id, m.display_name);
          return { albumId: album.id, userId: m.user_id, role: m.role };
        }),
      );
      if (album.role === 'owner') {
        const [invitePage] = await Promise.all([
          this.all<InviteDto>(`/albums/${album.id}/invites`),
        ]);
        state.invites.push(
          ...invitePage.map((i) => ({
            id: i.id,
            albumId: album.id,
            role: i.role,
            expiresAt: Date.parse(i.expires_at),
            revoked: i.revoked,
            ...this.inviteSecrets.get(i.id),
          })),
        );
      }

      const memories = await this.all<MemoryDto>(`/albums/${album.id}/memories`);
      for (const item of memories) {
        const photos = await this.request<{ items: PhotoDto[] }>(`/memories/${item.id}/photos`);
        const photoIds: string[] = [];
        for (const photo of photos.items) {
          const [full, thumb] = await Promise.all([
            this.request<{ url: string }>(`/photos/${photo.id}/read-url`),
            this.request<{ url: string }>(`/photos/${photo.id}/read-url?thumbnail=true`),
          ]);
          photoIds.push(photo.id);
          state.photos.push({
            id: photo.id,
            blob: new Blob(),
            checksum: photo.checksum,
            src: full.url,
            thumbnailSrc: thumb.url,
          });
        }
        state.memories.push({
          id: item.id,
          albumId: album.id,
          authorId: item.author_id,
          title: item.title,
          date: item.date ?? '',
          dateLabel: item.date_label ?? undefined,
          location: item.location,
          note: item.note,
          photoIds,
          order: item.position,
          version: item.version,
          published: item.published,
          animations: item.animations ?? {},
        });

        const [comments, reactions] = await Promise.all([
          this.all<CommentDto>(`/memories/${item.id}/comments`),
          this.request<{ items: ReactionDto[] }>(`/memories/${item.id}/reactions`),
        ]);
        state.comments.push(
          ...comments.map((c) => ({
            id: c.id,
            memoryId: c.memory_id,
            userId: c.author_id,
            text: c.body,
            edited: c.edited,
            version: c.version,
          })),
        );
        state.reactions.push(
          ...reactions.items.flatMap((r) =>
            emojiByKind[r.kind]
              ? [{ memoryId: item.id, userId: r.user_id, emoji: emojiByKind[r.kind] }]
              : [],
          ),
        );
      }
    }
    for (const comment of state.comments) {
      if (!names.has(comment.userId)) names.set(comment.userId, 'Member');
    }
    for (const [id, name] of names) {
      if (!state.users.some((u) => u.id === id)) state.users.push({ id, name, email: '' });
    }
    this.current = state;
    return state;
  }

  async dispatch(actor: Id, command: Command): Promise<Id | undefined> {
    const cached = this.current;
    const json = (value: unknown) => JSON.stringify(value);
    switch (command.type) {
      case 'createAlbum': {
        const album = await this.request<AlbumDto>('/albums', {
          method: 'POST',
          body: json({ title: command.title, description: command.description }),
        });
        return album.id;
      }
      case 'updateAlbum': {
        const album = cached?.albums.find((x) => x.id === command.albumId);
        await this.request(`/albums/${command.albumId}`, {
          method: 'PATCH',
          body: json({
            title: command.title,
            description: command.description,
            cover_photo_id: command.coverPhotoId ?? null,
            expected_version: album?.version ?? 1,
          }),
        });
        break;
      }
      case 'deleteAlbum':
        await this.request(`/albums/${command.albumId}`, { method: 'DELETE' });
        break;
      case 'saveMemory': {
        const previous = command.memoryId
          ? cached?.memories.find((x) => x.id === command.memoryId)
          : undefined;
        const body = {
          title: command.draft.title,
          date: command.draft.date || null,
          date_label: command.draft.date ? null : (command.draft.dateLabel ?? null),
          location: command.draft.location,
          note: command.draft.note,
          animations: command.draft.animations,
          ...(previous ? { expected_version: previous.version ?? 1 } : {}),
        };
        const item = previous
          ? await this.request<MemoryDto>(`/memories/${previous.id}`, {
              method: 'PATCH',
              body: json(body),
            })
          : await this.request<MemoryDto>(`/albums/${command.albumId}/memories`, {
              method: 'POST',
              body: json(body),
            });
        const uploaded: string[] = [];
        for (const blob of command.blobs) {
          const form = new FormData();
          form.append('file', blob, 'memory.jpg');
          const photo = await this.request<{ id: string }>(`/memories/${item.id}/photos`, {
            method: 'POST',
            body: form,
          });
          uploaded.push(photo.id);
        }
        let memoryVersion = item.version;
        if (!item.published && [...(command.preservePhotoIds ?? []), ...uploaded].length) {
          const published = await this.request<MemoryDto>(`/memories/${item.id}/publish`, {
            method: 'POST',
          });
          memoryVersion = published.version;
        }
        for (const id of previous?.photoIds ?? [])
          if (!command.preservePhotoIds?.includes(id))
            await this.request(`/photos/${id}`, { method: 'DELETE' });
        const ordered = [...(command.preservePhotoIds ?? []), ...uploaded];
        if (ordered.length)
          await this.request(`/memories/${item.id}/photo-order`, {
            method: 'PUT',
            body: json({ ids: ordered, expected_version: memoryVersion }),
          });
        return item.id;
      }
      case 'publishMemory': {
        await this.request(`/memories/${command.memoryId}/publish`, { method: 'POST' });
        break;
      }
      case 'deleteMemory':
        await this.request(`/memories/${command.memoryId}`, { method: 'DELETE' });
        break;
      case 'reorder': {
        const album = cached?.albums.find((x) => x.id === command.albumId);
        await this.request(`/albums/${command.albumId}/memory-order`, {
          method: 'PUT',
          body: json({ ids: command.ids, expected_version: album?.version ?? 1 }),
        });
        break;
      }
      case 'createInvite': {
        const hours = Math.max(
          1,
          Math.min(168, Math.ceil((command.expiresAt - Date.now()) / 3600000)),
        );
        const invite = await this.request<{ id: string; token: string; code: string }>(
          '/albums/' + command.albumId + '/invites',
          { method: 'POST', body: json({ role: command.role, hours }) },
        );
        this.inviteSecrets.set(invite.id, { token: invite.token, code: invite.code });
        return invite.id;
      }
      case 'revokeInvite': {
        const invite = cached?.invites.find((i) => i.id === command.inviteId);
        if (!invite) throw new Error('Invitation not found.');
        await this.request(`/albums/${invite.albumId}/invites/${command.inviteId}`, {
          method: 'DELETE',
        });
        this.inviteSecrets.delete(command.inviteId);
        break;
      }
      case 'join': {
        const result = await this.request<{ album_id: string }>('/invites/redeem', {
          method: 'POST',
          body: json({ secret: command.token }),
        });
        return result.album_id;
      }
      case 'setRole':
        await this.request(`/albums/${command.albumId}/members/${command.userId}`, {
          method: 'PATCH',
          body: json({ role: command.role }),
        });
        break;
      case 'removeMember':
        await this.request(`/albums/${command.albumId}/members/${command.userId}`, {
          method: 'DELETE',
        });
        break;
      case 'addComment':
        await this.request(`/memories/${command.memoryId}/comments`, {
          method: 'POST',
          body: json({ body: command.text }),
        });
        break;
      case 'editComment': {
        const comment = cached?.comments.find((x) => x.id === command.commentId);
        await this.request(`/comments/${command.commentId}`, {
          method: 'PATCH',
          body: json({ body: command.text, expected_version: comment?.version ?? 1 }),
        });
        break;
      }
      case 'deleteComment':
        await this.request(`/comments/${command.commentId}`, { method: 'DELETE' });
        break;
      case 'react': {
        const existing = cached?.reactions.find(
          (r) => r.memoryId === command.memoryId && r.userId === actor,
        );
        if (existing?.emoji === command.emoji)
          await this.request(`/memories/${command.memoryId}/reaction`, { method: 'DELETE' });
        else
          await this.request(`/memories/${command.memoryId}/reaction`, {
            method: 'PUT',
            body: json({ kind: kindByEmoji[command.emoji] }),
          });
        break;
      }
      case 'updateProfile':
        await this.request('/users/me', {
          method: 'PATCH',
          body: json({ display_name: command.name }),
        });
        break;
      default:
        throw new Error('This action is not supported for signed-in accounts.');
    }
    return undefined;
  }

  async previewInvite(token: string) {
    return this.request<{
      status: 'active' | 'invalid' | 'expired' | 'revoked';
      title?: string;
      role?: MemberRole;
      album_id?: string;
    }>('/invites/preview', { method: 'POST', body: JSON.stringify({ secret: token }) }).then(
      (value) => ({ ...value, albumId: value.album_id }),
    );
  }
  async importBatch(): Promise<{ imported: number; skipped: number }> {
    throw new Error('Legacy import is not enabled in the browser.');
  }
  async exportBackup(): Promise<string> {
    throw new Error('Local backup is unavailable for accounts.');
  }
  async restoreBackup() {
    throw new Error('Local restore is unavailable for accounts.');
  }
}
