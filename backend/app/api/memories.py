# ruff: noqa: F403,F405
from datetime import date
from fastapi import APIRouter
from ..services.media import persist_photo
from .common import *

router = APIRouter()


@router.post("/albums/{album_id}/memories", status_code=201)
def create_memory(album_id: str, body: s.MemoryCreate, user: Auth, db: Db):
    album, _ = album_access(db, album_id, user, write=True, lock=True)
    position = db.scalar(select(func.max(m.Memory.position)).where(m.Memory.album_id == album_id))
    memory = m.Memory(
        album_id=album_id,
        author_id=user.id,
        **{**body.model_dump(), "title": nonblank(body.title)},
        position=0 if position is None else position + 1,
    )
    album.version += 1
    db.add(memory)
    db.flush()
    return memory_json(memory)


@router.get("/albums/{album_id}/memories")
def memories(
    album_id: str,
    user: Auth,
    db: Db,
    q: str = Query("", max_length=200),
    date_from: date | None = None,
    date_to: date | None = None,
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=100),
):
    _, role = album_access(db, album_id, user)
    query = select(m.Memory).where(m.Memory.album_id == album_id, m.Memory.deleted.is_(False))
    if date_from and date_to and date_from > date_to:
        fail(422, "INVALID_DATE_RANGE", "date_from must be on or before date_to")
    if date_from:
        query = query.where(m.Memory.date >= date_from)
    if date_to:
        query = query.where(m.Memory.date <= date_to)
    if role != "owner":
        query = query.where(or_(m.Memory.published.is_(True), m.Memory.author_id == user.id))
    if q:
        # Escape wildcard characters so a search term is a literal substring.
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = "%" + escaped + "%"
        query = query.where(
            or_(
                m.Memory.title.ilike(pattern, escape="\\"),
                m.Memory.location.ilike(pattern, escape="\\"),
                m.Memory.note.ilike(pattern, escape="\\"),
            )
        )
    # Cursor uses position+ID to match the manual order, not UUID order.
    if cursor:
        try:
            pos, ident = base64.urlsafe_b64decode(cursor).decode().split(":", 1)
            pos = int(pos)
        except Exception:
            fail(422, "INVALID_CURSOR", "Invalid cursor")
        query = query.where(
            or_(m.Memory.position > pos, (m.Memory.position == pos) & (m.Memory.id > ident))
        )
    rows = db.scalars(query.order_by(m.Memory.position, m.Memory.id).limit(limit + 1)).all()
    items = rows[:limit]
    next_cursor = (
        base64.urlsafe_b64encode(f"{items[-1].position}:{items[-1].id}".encode()).decode()
        if len(rows) > limit
        else None
    )
    return {"items": [memory_json(x) for x in items], "next_cursor": next_cursor}


@router.get("/memories/{memory_id}")
def get_memory(memory_id: str, user: Auth, db: Db):
    return memory_json(memory_access(db, memory_id, user)[0])


@router.patch("/memories/{memory_id}")
def edit_memory(memory_id: str, body: s.MemoryEdit, user: Auth, db: Db):
    memory, _, _ = memory_access(db, memory_id, user, edit=True, lock=True)
    db.refresh(memory)
    version_check(memory, body.expected_version)
    for key, value in body.model_dump(exclude={"expected_version"}).items():
        setattr(memory, key, nonblank(value) if key == "title" else value)
    return memory_json(memory)


@router.post("/memories/{memory_id}/publish")
def publish(memory_id: str, user: Auth, db: Db):
    memory, _, _ = memory_access(db, memory_id, user, edit=True, lock=True)
    photo = db.scalar(
        select(m.Photo.id).where(m.Photo.memory_id == memory.id, m.Photo.status == "ready")
    )
    if not photo:
        fail(409, "NO_READY_PHOTO", "Upload at least one valid photo before publishing")
    memory.published = True
    memory.version += 1
    return memory_json(memory)


@router.delete("/memories/{memory_id}", status_code=204)
def delete_memory(memory_id: str, user: Auth, db: Db):
    memory, album, _ = memory_access(db, memory_id, user, edit=True, lock=True)
    memory.deleted = True
    album.version += 1
    photos = db.scalars(
        select(m.Photo).where(m.Photo.memory_id == memory.id, m.Photo.status != "deleting")
    ).all()
    photo_ids = {photo.id for photo in photos}
    if album.cover_photo_id in photo_ids:
        album.cover_photo_id = None
    for photo in photos:
        queue_photo_delete(db, photo)


@router.get("/memories/{memory_id}/photos")
def photos(memory_id: str, user: Auth, db: Db):
    memory_access(db, memory_id, user)
    rows = db.scalars(
        select(m.Photo)
        .where(m.Photo.memory_id == memory_id, m.Photo.status == "ready")
        .order_by(m.Photo.position)
    ).all()
    return {
        "items": [
            {
                k: getattr(p, k)
                for k in ("id", "width", "height", "mime", "byte_size", "position", "checksum")
            }
            for p in rows
        ]
    }


@router.put("/memories/{memory_id}/photo-order")
def reorder_photos(memory_id: str, body: s.PhotoReorder, user: Auth, db: Db):
    memory, _, _ = memory_access(db, memory_id, user, edit=True, lock=True)
    db.refresh(memory)
    version_check(memory, body.expected_version)
    rows = db.scalars(
        select(m.Photo).where(m.Photo.memory_id == memory_id, m.Photo.status == "ready")
    ).all()
    if len(body.ids) != len(set(body.ids)) or set(body.ids) != {photo.id for photo in rows}:
        fail(422, "INVALID_ORDER", "Send every ready photo ID exactly once")
    positions = {photo_id: index for index, photo_id in enumerate(body.ids)}
    for photo in rows:
        photo.position = positions[photo.id]
    return {"memory_version": memory.version}


@router.post("/memories/{memory_id}/photos", status_code=201)
def upload(memory_id: str, user: Auth, db: Db, file: UploadFile = File()):
    memory, _, _ = memory_access(db, memory_id, user, edit=True, lock=True)
    count = db.scalar(
        select(func.count())
        .select_from(m.Photo)
        .where(m.Photo.memory_id == memory.id, m.Photo.status.in_(["ready", "pending"]))
    )
    if count >= 10:
        fail(422, "PHOTO_LIMIT", "At most ten photos per memory")
    raw = file.file.read(settings().max_upload_bytes + 1)
    # The object is hidden while pending; re-check album authorization after storage I/O.
    photo = persist_photo(
        db,
        raw,
        memory_id=memory.id,
        position=count,
        before_ready=lambda: memory_access(db, memory_id, user, edit=True, lock=True),
    )
    return {"id": photo.id, "width": photo.width, "height": photo.height, "status": "ready"}


def photo_access(db, photo_id, user):
    photo = db.get(m.Photo, photo_id)
    if not photo or photo.status != "ready":
        fail(404, "NOT_FOUND", "Photo not found")
    if photo.memory_id:
        memory_access(db, photo.memory_id, user)
    elif photo.owner_id != user.id:
        fail(404, "NOT_FOUND", "Photo not found")
    return photo


@router.post("/photos/{photo_id}/read-url")
def photo_url(photo_id: str, user: Auth, db: Db, thumbnail: bool = False):
    photo = photo_access(db, photo_id, user)
    key = photo.thumbnail_key if thumbnail else photo.object_key
    store = storage()
    if isinstance(store, LocalStorage):
        return {
            "url": f"/api/v1/photos/{photo.id}/content?thumbnail={str(thumbnail).lower()}",
            "expires_at": None,
        }
    try:
        return {"url": store.sign(key), "expires_at": m.now() + timedelta(seconds=120)}
    except Exception:
        fail(503, "STORAGE_UNAVAILABLE", "Photo storage is unavailable")


@router.get("/photos/{photo_id}/content")
def photo_content(photo_id: str, user: Auth, db: Db, thumbnail: bool = False):
    photo = photo_access(db, photo_id, user)
    store = storage()
    if not isinstance(store, LocalStorage):
        fail(404, "NOT_FOUND", "Use an authorized temporary read URL")
    try:
        return Response(
            store.read(photo.thumbnail_key if thumbnail else photo.object_key),
            media_type="image/jpeg",
            headers={"Cache-Control": "no-store"},
        )
    except OSError:
        fail(503, "STORAGE_UNAVAILABLE", "Photo storage is unavailable")


@router.delete("/photos/{photo_id}", status_code=204)
def delete_photo(photo_id: str, user: Auth, db: Db):
    photo = photo_access(db, photo_id, user)
    memory, _, _ = memory_access(db, photo.memory_id, user, edit=True, lock=True)
    count = db.scalar(
        select(func.count())
        .select_from(m.Photo)
        .where(m.Photo.memory_id == memory.id, m.Photo.status == "ready")
    )
    if memory.published and count <= 1:
        fail(409, "LAST_PHOTO", "A published memory must have at least one photo")
    album, _ = album_access(db, memory.album_id, user)
    if album.cover_photo_id == photo.id:
        album.cover_photo_id = None
    queue_photo_delete(db, photo)
