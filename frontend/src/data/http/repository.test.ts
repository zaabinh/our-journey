// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { HttpRepository } from './repository';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

afterEach(() => vi.unstubAllGlobals());

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
