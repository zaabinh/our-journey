import type { Command, Id, JourneyRepository, Role, Store, User } from '../../domain/types';

type ApiUser = { id: string; email: string; username?: string; display_name: string };
const empty = (identity = ''): Store => ({ version: 1, identity, users: [], albums: [], members: [], invites: [], memories: [], photos: [], comments: [], reactions: [], imports: [] });
type AlbumDto = { id: string; owner_id: string; title: string; description: string; version: number; role: Role };
type MemoryDto = { id: string; album_id: string; author_id: string; title: string; date: string; location: string; note: string; position: number; version: number; published: boolean; animations: Record<string, unknown> };
type PhotoDto = { id: string; checksum: string };
type MemberDto = { user_id: string; display_name: string; role: 'owner' | 'contributor' | 'viewer' };

export class HttpRepository implements JourneyRepository {
  readonly mode = 'remote' as const;
  private csrf = '';
  private current?: Store;
  private async request<T>(path: string, init: RequestInit = {}, csrfRequired = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (csrfRequired && init.method && !['GET', 'HEAD', 'OPTIONS'].includes(init.method.toUpperCase())) {
      if (!this.csrf) this.csrf = (await this.request<{ csrf_token: string }>('/auth/csrf')).csrf_token;
      headers.set('X-CSRF-Token', this.csrf);
    }
    const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin' });
    if (!response.ok) {
      let message = `Yêu cầu thất bại (${response.status}).`;
      try { message = (await response.json()).error?.message ?? message; } catch { /* response has no JSON body */ }
      throw new Error(message);
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }
  async login(identifier: string, password: string) {
    const result = await this.request<{ user: ApiUser; csrf_token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }, false);
    this.csrf = result.csrf_token;
  }
  async register(input: { email: string; username: string; display_name: string; password: string }) {
    await this.request('/auth/register', { method: 'POST', body: JSON.stringify(input) }, false);
    await this.login(input.email, input.password);
  }
  async logout() { await this.request('/auth/logout', { method: 'POST' }); this.csrf = ''; this.current = undefined; }
  async identity() {
    const { user } = await this.request<{ user: ApiUser }>('/auth/session');
    const mapped: User = { id: user.id, name: user.display_name, email: user.email };
    return { active: user.id, users: [mapped] };
  }
  async selectIdentity() { throw new Error('Không thể chuyển danh tính trong phiên đăng nhập.'); }
  async createIdentity(): Promise<Id> { throw new Error('Hãy đăng ký tài khoản để tiếp tục.'); }
  async read(actor: Id): Promise<Store> {
    const { user: apiUser } = await this.request<{ user: ApiUser }>('/auth/session');
    const albumsResponse = await this.request<{ items: AlbumDto[] }>('/albums?limit=100');
    const state = empty(actor), user: User = { id: apiUser.id, name: apiUser.display_name, email: apiUser.email };
    state.users.push(user);
    state.albums = albumsResponse.items.map(a => ({ id: a.id, ownerId: a.owner_id, title: a.title, description: a.description, version: a.version, role: a.role }));
    for (const album of state.albums) {
      if (album.role === 'owner') state.members.push({ albumId: album.id, userId: actor, role: 'owner' });
      const memories = await this.request<{ items: MemoryDto[] }>(`/albums/${album.id}/memories?limit=100`);
      for (const item of memories.items) {
        const result = await this.request<{ items: PhotoDto[] }>(`/memories/${item.id}/photos`);
        const photoIds: string[] = [];
        for (const p of result.items) {
          const [full, thumb] = await Promise.all([
            this.request<{ url: string }>(`/photos/${p.id}/read-url`),
            this.request<{ url: string }>(`/photos/${p.id}/read-url?thumbnail=true`),
          ]);
          photoIds.push(p.id);
          state.photos.push({ id: p.id, blob: new Blob(), checksum: p.checksum, src: full.url, thumbnailSrc: thumb.url });
        }
        state.memories.push({ id: item.id, albumId: album.id, authorId: item.author_id, title: item.title, date: item.date ?? '', location: item.location, note: item.note, photoIds, order: item.position, version: item.version, published: item.published, animations: item.animations ?? {} });
      }
      const members = await this.request<{ items: MemberDto[] }>(`/albums/${album.id}/members`);
      state.members = state.members.filter(m => m.albumId !== album.id);
      state.members.push(...members.items.map(m => ({ albumId: album.id, userId: m.user_id, role: m.role })));
    }
    this.current = state;
    return state;
  }
  async dispatch(actor: Id, command: Command): Promise<Id | undefined> {
    const cached = this.current;
    const json = (value: unknown) => JSON.stringify(value);
    switch (command.type) {
      case 'createAlbum': { const a = await this.request<AlbumDto>('/albums', { method: 'POST', body: json({ title: command.title, description: command.description }) }); return a.id; }
      case 'updateAlbum': { const a = cached?.albums.find(x => x.id === command.albumId); await this.request(`/albums/${command.albumId}`, { method: 'PATCH', body: json({ title: command.title, description: command.description, expected_version: a?.version ?? 1 }) }); break; }
      case 'deleteAlbum': await this.request(`/albums/${command.albumId}`, { method: 'DELETE' }); break;
      case 'saveMemory': {
        const previous = command.memoryId ? cached?.memories.find(x => x.id === command.memoryId) : undefined;
        const body = { title: command.draft.title, date: command.draft.date, location: command.draft.location, note: command.draft.note, animations: command.draft.animations, ...(previous ? { expected_version: previous.version ?? 1 } : {}) };
        const item = previous ? await this.request<MemoryDto>(`/memories/${previous.id}`, { method: 'PATCH', body: json(body) }) : await this.request<MemoryDto>(`/albums/${command.albumId}/memories`, { method: 'POST', body: json(body) });
        for (const id of previous?.photoIds ?? []) if (!command.preservePhotoIds?.includes(id)) await this.request(`/photos/${id}`, { method: 'DELETE' });
        for (const blob of command.blobs) { const form = new FormData(); form.append('file', blob, 'memory.jpg'); await this.request(`/memories/${item.id}/photos`, { method: 'POST', body: form }); }
        return item.id;
      }
      case 'deleteMemory': await this.request(`/memories/${command.memoryId}`, { method: 'DELETE' }); break;
      case 'reorder': { const a = cached?.albums.find(x => x.id === command.albumId); await this.request(`/albums/${command.albumId}/memory-order`, { method: 'PUT', body: json({ ids: command.ids, expected_version: a?.version ?? 1 }) }); break; }
      case 'addComment': await this.request(`/memories/${command.memoryId}/comments`, { method: 'POST', body: json({ body: command.text }) }); break;
      case 'editComment': { const c = cached?.comments.find(x => x.id === command.commentId); await this.request(`/comments/${command.commentId}`, { method: 'PATCH', body: json({ body: command.text, expected_version: c?.version ?? 1 }) }); break; }
      case 'deleteComment': await this.request(`/comments/${command.commentId}`, { method: 'DELETE' }); break;
      case 'react': { const kind = ({ '❤️': 'heart', '😊': 'happy', '🎉': 'wow' } as Record<string,string>)[command.emoji] ?? 'heart'; await this.request(`/memories/${command.memoryId}/reaction`, { method: 'PUT', body: json({ kind }) }); break; }
      case 'updateProfile': { await this.request('/users/me', { method: 'PATCH', body: json({ display_name: command.name }) }); break; }
      default: throw new Error('Thao tác này chưa được hỗ trợ trong phiên bản máy chủ.');
    }
    void actor;
    return undefined;
  }
  async previewInvite() { return { status: 'invalid' as const }; }
  async importBatch(): Promise<{ imported: number; skipped: number }> { throw new Error('Nhập dữ liệu cũ chưa được bật trên máy chủ.'); }
  async exportBackup(): Promise<string> { throw new Error('Sao lưu cục bộ không khả dụng cho tài khoản.'); }
  async restoreBackup() { throw new Error('Khôi phục cục bộ không khả dụng cho tài khoản.'); }
}
