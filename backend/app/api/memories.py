# ruff: noqa: F403,F405
from fastapi import APIRouter
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
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=100),
):
    _, role = album_access(db, album_id, user)
    query = select(m.Memory).where(m.Memory.album_id == album_id, m.Memory.deleted.is_(False))
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
    for photo in db.scalars(
        select(m.Photo).where(m.Photo.memory_id == memory.id, m.Photo.status != "deleting")
    ):
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
    if len(raw) > settings().max_upload_bytes:
        fail(413, "FILE_TOO_LARGE", "Photo exceeds 15 MiB")
    try:
        with Image.open(BytesIO(raw)) as original:
            if original.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("Unsupported format")
            if original.width * original.height > settings().max_image_pixels:
                raise ValueError("Image dimensions exceed the limit")
            original.load()
            image = ImageOps.exif_transpose(original).convert("RGB")
            width, height = image.size
            # Re-encode to strip EXIF/GPS from the served image and reject polyglots.
            output = BytesIO()
            image.save(output, "JPEG", quality=92)
            safe = output.getvalue()
            image.thumbnail((640, 640))
            thumb = BytesIO()
            image.save(thumb, "JPEG", quality=80)
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
        fail(422, "INVALID_IMAGE", "Use a valid JPEG, PNG or WebP image within pixel limits")
    ident = m.uid()
    photo = m.Photo(
        id=ident,
        memory_id=memory.id,
        object_key=f"photos/{ident}.jpg",
        thumbnail_key=f"thumbnails/{ident}.jpg",
        mime="image/jpeg",
        byte_size=len(safe),
        width=width,
        height=height,
        checksum=hashlib.sha256(safe).hexdigest(),
        position=count,
    )
    db.add(photo)
    # Durable cleanup intent exists BEFORE any storage write. A crash cannot lose orphan tracking.
    jobs = [m.StorageJob(object_key=photo.object_key), m.StorageJob(object_key=photo.thumbnail_key)]
    db.add_all(jobs)
    db.commit()
    try:
        store = storage()
        store.put(photo.object_key, safe, "image/jpeg")
        store.put(photo.thumbnail_key, thumb.getvalue(), "image/jpeg")
        # Re-check membership after slow storage I/O; removal must not publish unauthorized data.
        memory_access(db, memory_id, user, edit=True, lock=True)
        photo.status = "ready"
        for job in jobs:
            db.delete(job)
        db.commit()
    except Exception:
        db.rollback()
        photo.status = "failed"
        db.commit()
        fail(503, "UPLOAD_FAILED", "Upload could not complete; please retry")
    return {"id": photo.id, "width": width, "height": height, "status": "ready"}


def photo_access(db, photo_id, user):
    photo = db.get(m.Photo, photo_id)
    if not photo or photo.status != "ready":
        fail(404, "NOT_FOUND", "Photo not found")
    memory_access(db, photo.memory_id, user)
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
    queue_photo_delete(db, photo)
