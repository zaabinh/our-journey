import { checksum } from '../codec';
import type { Store } from '../../domain/types';
export function emptyStore(): Store {
  return {
    version: 1,
    identity: '',
    users: [],
    albums: [],
    members: [],
    invites: [],
    memories: [],
    photos: [],
    comments: [],
    reactions: [],
    imports: [],
  };
}
// Generated 2x2 PNG in brand colors, never derived from personal media.
export const fixturePhoto = () =>
  new Blob(
    [
      new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 2, 0, 0, 0, 2, 8, 2,
        0, 0, 0, 253, 212, 154, 115, 0, 0, 0, 22, 73, 68, 65, 84, 120, 156, 99, 216, 230, 22, 255,
        231, 201, 19, 134, 72, 94, 165, 44, 57, 57, 0, 46, 28, 5, 78, 128, 202, 88, 149, 0, 0, 0, 0,
        73, 69, 78, 68, 174, 66, 96, 130,
      ]),
    ],
    { type: 'image/png' },
  );
export async function fixtureStore(): Promise<Store> {
  const blob = fixturePhoto();
  const hash = await checksum(blob),
    photoId = `photo-${hash}`;
  return {
    ...emptyStore(),
    identity: 'owner',
    users: [
      { id: 'owner', name: 'Chủ album demo', email: 'owner@example.invalid' },
      { id: 'contributor', name: 'Người góp chuyện demo', email: 'contributor@example.invalid' },
      { id: 'viewer', name: 'Người xem demo', email: 'viewer@example.invalid' },
      { id: 'outsider', name: 'Khách demo', email: 'outsider@example.invalid' },
    ],
    albums: [
      {
        id: 'fixture-album',
        title: 'Những ngày bên nhau',
        description: 'Album tổng hợp để khám phá Our Journey.',
        ownerId: 'owner',
        coverPhotoId: photoId,
      },
    ],
    members: [
      { albumId: 'fixture-album', userId: 'owner', role: 'owner' },
      { albumId: 'fixture-album', userId: 'contributor', role: 'contributor' },
      { albumId: 'fixture-album', userId: 'viewer', role: 'viewer' },
    ],
    memories: [
      {
        id: 'fixture-memory',
        albumId: 'fixture-album',
        authorId: 'owner',
        title: 'Một sáng trong vườn',
        date: '2026-10-01',
        location: 'Khu vườn demo',
        note: 'Đây là câu chuyện tổng hợp. Không có dữ liệu cá nhân.',
        photoIds: [photoId],
        order: 0,
        animations: { heart: true, gift: false },
      },
    ],
    photos: [{ id: photoId, blob, checksum: hash, thumbnail: blob }],
  };
}
