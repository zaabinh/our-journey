export type Id = string;
export type Role = 'owner' | 'contributor' | 'viewer';
export type MemberRole = Exclude<Role, 'owner'>;
export type Emoji = '❤️' | '😊' | '🎉';
export interface User {
  id: Id;
  name: string;
  email: string;
}
export interface Album {
  id: Id;
  title: string;
  description: string;
  ownerId: Id;
  coverPhotoId?: Id;
  version?: number;
  role?: Role;
}
export interface AlbumMember {
  albumId: Id;
  userId: Id;
  role: Role;
}
export interface Invite {
  id: Id;
  token: string;
  albumId: Id;
  role: MemberRole;
  expiresAt: number;
  revoked: boolean;
}
export interface Photo {
  id: Id;
  blob: Blob;
  checksum: string;
  thumbnail?: Blob;
  src?: string;
  thumbnailSrc?: string;
}
export interface Memory {
  id: Id;
  albumId: Id;
  authorId: Id;
  title: string;
  date: string;
  dateLabel?: string;
  location: string;
  note: string;
  photoIds: Id[];
  order: number;
  version?: number;
  published?: boolean;
  animations: Record<string, unknown>;
  legacy?: Record<string, unknown>;
}
export interface Comment {
  id: Id;
  memoryId: Id;
  userId: Id;
  text: string;
  edited: boolean;
  version?: number;
}
export interface Reaction {
  memoryId: Id;
  userId: Id;
  emoji: Emoji;
}
export interface ImportCheckpoint {
  key: string;
  hash: string;
  memoryId: Id;
}
export interface Store {
  version: 1;
  identity: Id;
  users: User[];
  albums: Album[];
  members: AlbumMember[];
  invites: Invite[];
  memories: Memory[];
  photos: Photo[];
  comments: Comment[];
  reactions: Reaction[];
  imports: ImportCheckpoint[];
}
export interface MemoryDraft {
  title: string;
  date: string;
  dateLabel?: string;
  location: string;
  note: string;
  animations: Record<string, unknown>;
}
export type Command =
  | { type: 'createAlbum'; title: string; description: string }
  | { type: 'updateAlbum'; albumId: Id; title: string; description: string; coverPhotoId?: Id }
  | { type: 'deleteAlbum'; albumId: Id }
  | {
      type: 'saveMemory';
      albumId: Id;
      memoryId?: Id;
      draft: MemoryDraft;
      blobs: Blob[];
      preservePhotoIds?: Id[];
    }
  | { type: 'deleteMemory'; memoryId: Id }
  | { type: 'reorder'; albumId: Id; ids: Id[] }
  | { type: 'createInvite'; albumId: Id; role: MemberRole; expiresAt: number }
  | { type: 'revokeInvite'; inviteId: Id }
  | { type: 'join'; token: string }
  | { type: 'setRole'; albumId: Id; userId: Id; role: MemberRole }
  | { type: 'removeMember'; albumId: Id; userId: Id }
  | { type: 'addComment'; memoryId: Id; text: string }
  | { type: 'editComment'; commentId: Id; text: string }
  | { type: 'deleteComment'; commentId: Id }
  | { type: 'react'; memoryId: Id; emoji: Emoji }
  | { type: 'updateProfile'; name: string; email: string };
export interface PreparedMemory {
  key: string;
  hash: string;
  albumId: Id;
  authorId: Id;
  legacy: Record<string, unknown>;
  draft: MemoryDraft;
  order: number;
  photos: Photo[];
}
export interface ImportPlan {
  records: PreparedMemory[];
  errors: { index: number; reason: string }[];
  warnings: string[];
}
export interface JourneyRepository {
  readonly mode?: 'local' | 'remote';
  identity(): Promise<{ active: Id; users: User[] }>;
  selectIdentity(userId: Id): Promise<void>;
  createIdentity(name: string, email: string): Promise<Id>;
  read(actor: Id): Promise<Store>;
  dispatch(actor: Id, command: Command): Promise<Id | undefined>;
  previewInvite(token: string): Promise<{
    status: 'active' | 'invalid' | 'expired' | 'revoked';
    title?: string;
    role?: MemberRole;
    albumId?: Id;
  }>;
  importBatch(
    actor: Id,
    plan: ImportPlan,
    batchSize?: number,
    onProgress?: (completed: number, total: number, stage: 'verify' | 'write') => void,
  ): Promise<{ imported: number; skipped: number }>;
  exportBackup(): Promise<string>;
  restoreBackup(text: string): Promise<void>;
}
