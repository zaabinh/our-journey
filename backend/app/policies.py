from sqlalchemy import select

from .errors import fail
from .models import Album, Member, Memory


def album_access(db, album_id, user, write=False, owner=False, lock=False):
    query = select(Album).where(Album.id == album_id, Album.deleted.is_(False))
    if lock:
        query = query.with_for_update()
    album = db.scalar(query)
    if not album:
        fail(404, "NOT_FOUND", "Album not found")
    role = "owner" if album.owner_id == user.id else None
    if not role:
        member = db.get(Member, (album.id, user.id))
        role = member.role if member else None
    if not role:
        fail(404, "NOT_FOUND", "Album not found")
    if (owner and role != "owner") or (write and role == "viewer"):
        fail(403, "FORBIDDEN", "Insufficient permissions")
    return album, role


def memory_access(db, memory_id, user, write=False, edit=False, lock=False):
    memory = db.scalar(select(Memory).where(Memory.id == memory_id, Memory.deleted.is_(False)))
    if not memory:
        fail(404, "NOT_FOUND", "Memory not found")
    album, role = album_access(db, memory.album_id, user, write=write or edit, lock=lock)
    if edit and role != "owner" and memory.author_id != user.id:
        fail(403, "FORBIDDEN", "Only the author or album owner can edit this memory")
    if not memory.published and role != "owner" and memory.author_id != user.id:
        fail(404, "NOT_FOUND", "Memory not found")
    return memory, album, role


def nonblank(value):
    if not value.strip():
        fail(422, "VALIDATION_ERROR", "Text cannot be blank")
    return value.strip()


def version_check(entity, expected):
    if entity.version != expected:
        fail(409, "VERSION_CONFLICT", "Content has changed; reload before saving")
    entity.version += 1
