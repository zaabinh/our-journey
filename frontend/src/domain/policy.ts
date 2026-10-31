import type { AlbumMember, Id, Memory, Role } from './types';
export const roleOf = (members: AlbumMember[], albumId: Id, userId: Id): Role | undefined =>
  members.find((m) => m.albumId === albumId && m.userId === userId)?.role;
export const canWrite = (role: Role | undefined) => role === 'owner' || role === 'contributor';
export const canManage = (role: Role | undefined) => role === 'owner';
export const canEditOwn = (role: Role | undefined, authorId: Id, actor: Id) =>
  canWrite(role) && authorId === actor;
export const canEdit = (role: Role | undefined, authorId: Id, actor: Id) =>
  role === 'owner' || (role === 'contributor' && authorId === actor);
export function requireRole(
  members: AlbumMember[],
  albumId: Id,
  actor: Id,
  roles: Role[] = ['owner', 'contributor', 'viewer'],
) {
  const role = roleOf(members, albumId, actor);
  if (!role || !roles.includes(role)) throw Error('Bạn không có quyền thực hiện thao tác này.');
  return role;
}
export function requireEdit(members: AlbumMember[], memory: Memory, actor: Id) {
  if (!canEdit(roleOf(members, memory.albumId, actor), memory.authorId, actor))
    throw Error('Bạn không có quyền sửa kỷ niệm này.');
}
export function dateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw Error('Nội dung không hợp lệ hoặc vượt giới hạn.');
  return value;
}
