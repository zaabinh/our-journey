// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, HttpRepository } from './repository';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

afterEach(() => vi.unstubAllGlobals());

test('caches a signed-in snapshot briefly and refreshes it after an avatar change', async () => {
  const calls: { path: string; method: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://local.test').pathname.replace('/api/v1', '');
      calls.push({ path, method: init?.method ?? 'GET' });
      if (path === '/auth/session')
        return json({
          user: { id: 'u1', email: 'u@example.test', display_name: 'Owner', avatar_photo_id: 'p1' },
        });
      if (path === '/auth/csrf') return json({ csrf_token: 'csrf' });
      if (path === '/photos/p1/read-url') return json({ url: '/avatar.jpg' });
      if (path === '/albums') return json({ items: [], next_cursor: null });
      if (path === '/users/me/avatar') return json({ id: 'p1' });
      throw new Error(`Unhandled request ${path}`);
    }),
  );
  const repo = new HttpRepository();
  await repo.read('u1');
  await repo.read('u1');
  expect(calls.filter((call) => call.path === '/albums')).toHaveLength(1);
  expect(calls.filter((call) => call.path === '/photos/p1/read-url')).toEqual([
    { path: '/photos/p1/read-url', method: 'POST' },
  ]);
  await repo.uploadAvatar(new Blob(['avatar']));
  await repo.read('u1');
  expect(calls.filter((call) => call.path === '/albums')).toHaveLength(2);
});

test("revalidation sees another account's change before the snapshot TTL expires", async () => {
  let title = 'Ban đầu';
  let albumReads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://local.test').pathname.replace('/api/v1', '');
      if (path === '/auth/session')
        return json({ user: { id: 'u1', email: 'u@example.test', display_name: 'Owner' } });
      if (path === '/albums') {
        albumReads++;
        return json({
          items: [
            {
              id: 'a1',
              owner_id: 'u1',
              title,
              description: '',
              version: albumReads,
              role: 'owner',
            },
          ],
          next_cursor: null,
        });
      }
      if (path === '/albums/a1/members')
        return json({ items: [{ user_id: 'u1', display_name: 'Owner', role: 'owner' }] });
      if (path === '/albums/a1/invites' || path === '/albums/a1/memories')
        return json({ items: [], next_cursor: null });
      throw Error(`Unhandled ${path}`);
    }),
  );
  const repo = new HttpRepository();
  expect((await repo.read('u1')).albums[0].title).toBe('Ban đầu');
  title = 'Đã đổi từ tab khác';
  expect((await repo.read('u1')).albums[0].title).toBe('Ban đầu');
  repo.invalidate();
  expect((await repo.read('u1')).albums[0].title).toBe('Đã đổi từ tab khác');
  expect(albumReads).toBe(2);
});

test('an older response cannot restore stale album data after revalidation', async () => {
  let releaseOld: ((value: Response) => void) | undefined;
  let firstRequested: (() => void) | undefined;
  const reachedFirst = new Promise<void>((resolve) => {
    firstRequested = resolve;
  });
  let albumReads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://local.test').pathname.replace('/api/v1', '');
      if (path === '/auth/session')
        return json({ user: { id: 'u1', email: 'u@example.test', display_name: 'Owner' } });
      if (path === '/albums') {
        albumReads++;
        if (albumReads === 1) {
          firstRequested?.();
          return new Promise<Response>((resolve) => {
            releaseOld = resolve;
          });
        }
        return json({ items: [], next_cursor: null });
      }
      if (path === '/albums/a1/members')
        return json({ items: [{ user_id: 'u1', display_name: 'Owner', role: 'owner' }] });
      if (path === '/albums/a1/invites' || path === '/albums/a1/memories')
        return json({ items: [], next_cursor: null });
      throw Error(`Unhandled ${path}`);
    }),
  );
  const repo = new HttpRepository();
  const oldRead = repo.read('u1');
  await reachedFirst;
  repo.invalidate();
  expect((await repo.read('u1')).albums).toHaveLength(0);
  releaseOld?.(
    json({
      items: [
        { id: 'a1', owner_id: 'u1', title: 'Stale', description: '', version: 1, role: 'owner' },
      ],
      next_cursor: null,
    }),
  );
  await oldRead;
  expect((await repo.read('u1')).albums).toHaveLength(0);
  expect(albumReads).toBe(2);
});

test('backend validation identifies the affected field without exposing submitted values', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            fields: [{ field: 'body.email', message: 'Invalid email' }],
          },
        },
        422,
      ),
    ),
  );
  await expect(
    new HttpRepository().register({
      email: 'bad',
      username: 'person',
      display_name: 'Person',
      password: 'long-password',
    }),
  ).rejects.toMatchObject({
    fields: { email: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.' },
  } satisfies Partial<ApiError>);
});

test('photo order keeps newly uploaded photos interleaved with existing photos', async () => {
  let savedOrder: string[] = [];
  let uploads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://local.test').pathname.replace('/api/v1', '');
      if (path === '/auth/csrf') return json({ csrf_token: 'csrf' });
      if (path === '/albums/a1/memories' && init?.method === 'POST')
        return json({ id: 'm1', album_id: 'a1', version: 1, published: true }, 201);
      if (path === '/memories/m1/photos' && init?.method === 'POST')
        return json({ id: `new-${++uploads}` }, 201);
      if (path === '/memories/m1/photo-order' && init?.method === 'PUT') {
        savedOrder = JSON.parse(String(init.body)).ids;
        return json({});
      }
      throw Error(`Unhandled ${path}`);
    }),
  );
  await new HttpRepository().dispatch('u1', {
    type: 'saveMemory',
    albumId: 'a1',
    draft: { title: 'Story', date: '2026-01-01', location: '', note: '', animations: {} },
    blobs: [new Blob(['one']), new Blob(['two'])],
    preservePhotoIds: ['old-1', 'old-2'],
    photoOrder: [
      { kind: 'saved', id: 'old-1' },
      { kind: 'new', index: 0 },
      { kind: 'saved', id: 'old-2' },
      { kind: 'new', index: 1 },
    ],
  });
  expect(savedOrder).toEqual(['old-1', 'new-1', 'old-2', 'new-2']);
});

test('read drains album, memory, invitation, and comment cursors and restores social state', async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://local.test');
      calls.push(`${url.pathname}${url.search}`);
      const path = url.pathname.replace('/api/v1', '');
      const cursor = url.searchParams.get('cursor');
      if (path === '/auth/session')
        return json({ user: { id: 'u1', email: 'u@example.test', display_name: 'Owner' } });
      if (path === '/albums')
        return cursor
          ? json({
              items: [
                {
                  id: 'a2',
                  owner_id: 'u1',
                  title: 'Second',
                  description: '',
                  version: 1,
                  role: 'contributor',
                },
              ],
              next_cursor: null,
            })
          : json({
              items: [
                {
                  id: 'a1',
                  owner_id: 'u1',
                  title: 'First',
                  description: '',
                  version: 1,
                  role: 'owner',
                },
              ],
              next_cursor: 'albums-next',
            });
      if (path.endsWith('/members'))
        return json({
          items: [
            {
              user_id: 'u1',
              display_name: 'Owner',
              role: path.includes('a1') ? 'owner' : 'contributor',
            },
            { user_id: 'u2', display_name: 'Writer', role: 'contributor' },
          ],
        });
      if (path === '/albums/a1/invites')
        return cursor
          ? json({
              items: [
                { id: 'i2', role: 'viewer', expires_at: '2030-01-01T00:00:00Z', revoked: false },
              ],
              next_cursor: null,
            })
          : json({
              items: [
                {
                  id: 'i1',
                  role: 'contributor',
                  expires_at: '2030-01-01T00:00:00Z',
                  revoked: false,
                },
              ],
              next_cursor: 'invites-next',
            });
      if (path === '/albums/a1/memories')
        return cursor
          ? json({
              items: [
                {
                  id: 'm2',
                  album_id: 'a1',
                  author_id: 'u1',
                  title: 'Two',
                  date: null,
                  location: '',
                  note: '',
                  position: 1,
                  version: 1,
                  published: true,
                  animations: {},
                },
              ],
              next_cursor: null,
            })
          : json({
              items: [
                {
                  id: 'm1',
                  album_id: 'a1',
                  author_id: 'u2',
                  title: 'One',
                  date: null,
                  location: '',
                  note: '',
                  position: 0,
                  version: 1,
                  published: true,
                  animations: {},
                },
              ],
              next_cursor: 'memories-next',
            });
      if (path === '/albums/a2/memories') return json({ items: [], next_cursor: null });
      if (path.startsWith('/memories/') && path.endsWith('/photos')) return json({ items: [] });
      if (path === '/memories/m1/comments')
        return cursor
          ? json({
              items: [
                {
                  id: 'c2',
                  memory_id: 'm1',
                  author_id: 'u1',
                  body: 'Second comment',
                  edited: true,
                  version: 2,
                },
              ],
              next_cursor: null,
            })
          : json({
              items: [
                {
                  id: 'c1',
                  memory_id: 'm1',
                  author_id: 'u2',
                  body: 'First comment',
                  edited: false,
                  version: 1,
                },
              ],
              next_cursor: 'comments-next',
            });
      if (path === '/memories/m2/comments') return json({ items: [], next_cursor: null });
      if (path === '/memories/m1/reactions')
        return json({ items: [{ user_id: 'u2', kind: 'wow' }] });
      if (path === '/memories/m2/reactions') return json({ items: [] });
      throw new Error(`Unhandled request ${path}${url.search}`);
    }),
  );

  const state = await new HttpRepository().read('u1');
  expect(state.albums).toHaveLength(2);
  expect(state.memories.map((memory) => memory.id)).toEqual(['m1', 'm2']);
  expect(state.invites.map((invite) => invite.id)).toEqual(['i1', 'i2']);
  expect(state.comments.map((comment) => comment.id)).toEqual(['c1', 'c2']);
  expect(state.users.find((user) => user.id === 'u2')?.name).toBe('Writer');
  expect(state.reactions).toEqual([{ memoryId: 'm1', userId: 'u2', emoji: '🎉' }]);
  expect(calls).toContain('/api/v1/albums?limit=100&cursor=albums-next');
  expect(calls).toContain('/api/v1/albums/a1/memories?limit=100&cursor=memories-next');
  expect(calls).toContain('/api/v1/albums/a1/invites?limit=100&cursor=invites-next');
  expect(calls).toContain('/api/v1/memories/m1/comments?limit=100&cursor=comments-next');
});

test('invite preview, redemption, and explicit memory publishing call their server routes', async () => {
  const calls: { path: string; method: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://local.test');
      const path = url.pathname.replace('/api/v1', '');
      if (path === '/auth/csrf') return json({ csrf_token: 'csrf' });
      calls.push({ path, method: init?.method ?? 'GET', body: init?.body?.toString() });
      if (path === '/invites/preview')
        return json({ status: 'active', album_id: 'a1', title: 'Trip', role: 'viewer' });
      if (path === '/invites/redeem') return json({ album_id: 'a1', already_member: false });
      if (path === '/memories/m1/publish') return json({ id: 'm1', published: true });
      throw new Error(`Unhandled request ${path}`);
    }),
  );
  const repo = new HttpRepository();
  await expect(repo.previewInvite('invite-token')).resolves.toMatchObject({
    status: 'active',
    albumId: 'a1',
  });
  await expect(repo.dispatch('u1', { type: 'join', token: 'invite-token' })).resolves.toBe('a1');
  await repo.dispatch('u1', { type: 'publishMemory', memoryId: 'm1' });
  expect(calls.map((call) => [call.path, call.method])).toEqual([
    ['/invites/preview', 'POST'],
    ['/invites/redeem', 'POST'],
    ['/memories/m1/publish', 'POST'],
  ]);
});

test('failed reaction request leaves prior choice intact and does not claim success', async () => {
  const requests: { path: string; method: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://local.test').pathname.replace('/api/v1', '');
      requests.push({ path, method: init?.method ?? 'GET', body: init?.body?.toString() });
      if (path === '/auth/session')
        return json({ user: { id: 'u1', email: 'u@example.test', display_name: 'Owner' } });
      if (path === '/auth/csrf') return json({ csrf_token: 'csrf' });
      if (path === '/albums')
        return json({
          items: [
            {
              id: 'a1',
              owner_id: 'u1',
              title: 'Album',
              description: '',
              version: 1,
              role: 'owner',
            },
          ],
          next_cursor: null,
        });
      if (path === '/albums/a1/members')
        return json({ items: [{ user_id: 'u1', display_name: 'Owner', role: 'owner' }] });
      if (path === '/albums/a1/invites') return json({ items: [], next_cursor: null });
      if (path === '/albums/a1/memories')
        return json({
          items: [
            {
              id: 'm1',
              album_id: 'a1',
              author_id: 'u1',
              title: 'Memory',
              date: null,
              location: '',
              note: '',
              position: 0,
              version: 1,
              published: true,
              animations: {},
            },
          ],
          next_cursor: null,
        });
      if (path === '/memories/m1/photos') return json({ items: [] });
      if (path === '/memories/m1/comments') return json({ items: [], next_cursor: null });
      if (path === '/memories/m1/reactions')
        return json({ items: [{ user_id: 'u1', kind: 'heart' }] });
      if (path === '/memories/m1/reaction') return json({ error: { message: 'Try again' } }, 503);
      throw new Error(`Unhandled request ${path}`);
    }),
  );
  const repo = new HttpRepository();
  const state = await repo.read('u1');
  await expect(
    repo.dispatch('u1', { type: 'react', memoryId: 'm1', emoji: 'moved' }),
  ).rejects.toThrow('Try again');
  expect(state.reactions).toEqual([{ memoryId: 'm1', userId: 'u1', emoji: '❤️' }]);
  expect(requests.find((request) => request.path === '/memories/m1/reaction')).toMatchObject({
    method: 'PUT',
    body: '{"kind":"moved"}',
  });
});
