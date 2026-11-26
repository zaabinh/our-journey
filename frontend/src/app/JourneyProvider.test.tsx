import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JourneyProvider, useJourney } from './JourneyProvider';
import type { JourneyRepository, Store } from '../domain/types';

afterEach(cleanup);

function Snapshot() {
  const { state } = useJourney();
  return (
    <div data-testid="albums">
      {state?.albums.map((album) => album.title).join(', ') ?? 'Chưa tải'}
    </div>
  );
}

test('an active remote tab revalidates shared albums and drops revoked access', async () => {
  const interval = vi.spyOn(window, 'setInterval');
  let albums = [{ id: 'a1', title: 'Ban đầu', description: '', ownerId: 'u1' }];
  const read = vi.fn(
    async (): Promise<Store> => ({
      version: 1,
      identity: 'u1',
      users: [],
      albums: [...albums],
      members: [],
      invites: [],
      memories: [],
      photos: [],
      comments: [],
      reactions: [],
      imports: [],
    }),
  );
  const invalidate = vi.fn();
  const repo = {
    mode: 'remote',
    identity: async () => ({ active: 'u1', users: [] }),
    read,
    invalidate,
  } as unknown as JourneyRepository;
  render(
    <JourneyProvider repo={repo}>
      <Snapshot />
    </JourneyProvider>,
  );
  expect(await screen.findByText('Ban đầu')).toBeTruthy();
  albums = [{ ...albums[0], title: 'Đã đổi từ tài khoản khác' }];
  fireEvent.focus(window);
  expect(await screen.findByText('Đã đổi từ tài khoản khác')).toBeTruthy();
  const poll = interval.mock.calls.find(([, delay]) => delay === 30_000)?.[0];
  expect(poll).toBeTypeOf('function');
  albums = [{ ...albums[0], title: 'Bình luận mới từ tài khoản khác' }];
  await act(async () => {
    if (typeof poll === 'function') poll();
  });
  expect(await screen.findByText('Bình luận mới từ tài khoản khác')).toBeTruthy();
  albums = [];
  fireEvent.focus(window);
  await waitFor(() => expect(screen.getByTestId('albums').textContent).toBe(''));
  expect(read).toHaveBeenCalledTimes(4);
  expect(invalidate).toHaveBeenCalledTimes(4);
});
