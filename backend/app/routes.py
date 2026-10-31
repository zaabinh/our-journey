import base64
import hashlib
import secrets
from datetime import timedelta
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session as DB

from . import models as m
from . import schemas as s
from .config import settings
from .db import get_db
from .errors import fail
from .policies import album_access, memory_access, nonblank, version_check
from .security import COOKIE, DUMMY_HASH, authenticated, check_origin, digest, limit_auth, passwords
from .storage import LocalStorage, storage

router = APIRouter()
Db = Annotated[DB, Depends(get_db)]
Auth = Annotated[m.User, Depends(authenticated)]


def public_user(user):
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "display_name": user.display_name,
    }


def album_json(a, role=None):
    return {
        "id": a.id,
        "owner_id": a.owner_id,
        "title": a.title,
        "description": a.description,
        "version": a.version,
        "role": role,
    }


def memory_json(a):
    return {
        k: getattr(a, k)
        for k in (
            "id",
            "album_id",
            "author_id",
            "title",
            "date",
            "location",
            "note",
            "animations",
            "position",
            "version",
            "published",
        )
    }


def page(query, db, id_column, cursor, limit):
    if cursor:
        query = query.where(id_column > cursor)
    items = db.scalars(query.order_by(id_column).limit(limit + 1)).all()
    return items[:limit], items[limit - 1].id if len(items) > limit else None


@router.post("/auth/register", status_code=201)
def register(body: s.Register, request: Request, db: Db):
    check_origin(request)
    limit_auth(request, db, body.email)
    user = m.User(
        email=body.email,
        username=body.username,
        display_name=body.display_name,
        password_hash=passwords.hash(body.password),
    )
    db.add(user)
    db.flush()
    return public_user(user)


@router.post("/auth/login")
def login(body: s.Login, request: Request, response: Response, db: Db):
    from .security import find_login

    check_origin(request)
    limit_auth(request, db, body.identifier)
    user = find_login(db, body.identifier)
    valid = passwords.verify(body.password, user.password_hash if user else DUMMY_HASH)
    if not valid or not user:
        fail(401, "INVALID_CREDENTIALS", "Invalid credentials")
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(delete(m.Session).where(m.Session.token_hash == digest(old)))
    token = secrets.token_urlsafe(32)
    csrf = digest("csrf:" + token)
    db.add(
        m.Session(
            user_id=user.id,
            token_hash=digest(token),
            csrf_hash=digest(csrf),
            expires_at=m.now() + timedelta(hours=settings().session_hours),
        )
    )
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=settings().environment == "production",
        samesite="lax",
        max_age=settings().session_hours * 3600,
        path="/",
    )
    return {"user": public_user(user), "csrf_token": csrf}


@router.get("/auth/session")
def session(user: Auth):
    return {"user": public_user(user)}


@router.get("/auth/csrf")
def csrf(request: Request, user: Auth, db: Db):
    # Stable per-session CSRF token; no GET mutation or cross-tab invalidation.
    token = digest("csrf:" + request.cookies[COOKIE])
    return {"csrf_token": token}


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, user: Auth, db: Db):
    db.delete(request.state.session)
    response.delete_cookie(COOKIE, path="/")


@router.get("/users/me")
def profile(user: Auth):
    return public_user(user)


@router.patch("/users/me")
def edit_profile(body: s.Profile, user: Auth, db: Db):
    user.display_name = nonblank(body.display_name)
    return public_user(user)


@router.get("/albums")
def albums(user: Auth, db: Db, cursor: str | None = None, limit: int = Query(20, ge=1, le=100)):
    joined = select(m.Member.album_id).where(m.Member.user_id == user.id)
    query = select(m.Album).where(
        m.Album.deleted.is_(False), or_(m.Album.owner_id == user.id, m.Album.id.in_(joined))
    )
    items, next_cursor = page(query, db, m.Album.id, cursor, limit)
    return {
        "items": [album_json(a, album_access(db, a.id, user)[1]) for a in items],
        "next_cursor": next_cursor,
    }


@router.post("/albums", status_code=201)
def create_album(body: s.AlbumCreate, user: Auth, db: Db):
    album = m.Album(owner_id=user.id, title=nonblank(body.title), description=body.description)
    db.add(album)
    db.flush()
    return album_json(album, "owner")


@router.get("/albums/{album_id}")
def get_album(album_id: str, user: Auth, db: Db):
    album, role = album_access(db, album_id, user)
    return album_json(album, role)


@router.patch("/albums/{album_id}")
def edit_album(album_id: str, body: s.AlbumEdit, user: Auth, db: Db):
    album, _ = album_access(db, album_id, user, owner=True, lock=True)
    version_check(album, body.expected_version)
    album.title, album.description = nonblank(body.title), body.description
    return album_json(album, "owner")


def queue_photo_delete(db, photo):
    photo.status = "deleting"
    for key in (photo.object_key, photo.thumbnail_key):
        db.add(m.StorageJob(object_key=key))


@router.delete("/albums/{album_id}", status_code=204)
def delete_album(album_id: str, user: Auth, db: Db):
    album, _ = album_access(db, album_id, user, owner=True, lock=True)
    album.deleted = True
    photos = db.scalars(
        select(m.Photo)
        .join(m.Memory)
        .where(m.Memory.album_id == album.id, m.Photo.status != "deleting")
    ).all()
    for photo in photos:
        queue_photo_delete(db, photo)


@router.get("/albums/{album_id}/members")
def members(album_id: str, user: Auth, db: Db):
    album, _ = album_access(db, album_id, user)
    owner = db.get(m.User, album.owner_id)
    rows = db.execute(
        select(m.Member, m.User).join(m.User).where(m.Member.album_id == album_id)
    ).all()
    return {
        "items": [{"user_id": owner.id, "display_name": owner.display_name, "role": "owner"}]
        + [{"user_id": u.id, "display_name": u.display_name, "role": a.role} for a, u in rows]
    }


@router.patch("/albums/{album_id}/members/{user_id}", status_code=204)
def edit_member(album_id: str, user_id: str, body: s.MemberEdit, user: Auth, db: Db):
    album, _ = album_access(db, album_id, user, owner=True, lock=True)
    if user_id == album.owner_id:
        fail(409, "OWNER_PROTECTED", "Owner cannot be demoted")
    member = db.get(m.Member, (album_id, user_id))
    if not member:
        fail(404, "NOT_FOUND", "Member not found")
    member.role = body.role


@router.delete("/albums/{album_id}/members/{user_id}", status_code=204)
def remove_member(album_id: str, user_id: str, user: Auth, db: Db):
    album, _ = album_access(db, album_id, user, owner=True, lock=True)
    if album.owner_id == user_id:
        fail(409, "OWNER_PROTECTED", "Owner cannot leave")
    db.execute(delete(m.Member).where(m.Member.album_id == album_id, m.Member.user_id == user_id))


@router.post("/albums/{album_id}/leave", status_code=204)
def leave(album_id: str, user: Auth, db: Db):
    album, _ = album_access(db, album_id, user, lock=True)
    if album.owner_id == user.id:
        fail(409, "OWNER_PROTECTED", "Owner cannot leave")
    db.delete(db.get(m.Member, (album_id, user.id)))


@router.post("/albums/{album_id}/invites", status_code=201)
def invite(album_id: str, body: s.InviteCreate, user: Auth, db: Db):
    album_access(db, album_id, user, owner=True)
    token, code = secrets.token_urlsafe(32), secrets.token_hex(8).upper()
    inv = m.Invite(
        album_id=album_id,
        token_hash=digest(token),
        code_hash=digest(code),
        role=body.role,
        expires_at=m.now() + timedelta(hours=body.hours),
        max_uses=body.max_uses,
    )
    db.add(inv)
    db.flush()
    return {
        "id": inv.id,
        "token": token,
        "code": code,
        "role": inv.role,
        "expires_at": inv.expires_at,
    }


@router.get("/albums/{album_id}/invites")
def invites(album_id: str, user: Auth, db: Db):
    album_access(db, album_id, user, owner=True)
    rows = db.scalars(select(m.Invite).where(m.Invite.album_id == album_id).limit(100)).all()
    return {
        "items": [
            {
                k: getattr(i, k)
                for k in ("id", "role", "expires_at", "revoked", "used_count", "max_uses")
            }
            for i in rows
        ]
    }


@router.delete("/albums/{album_id}/invites/{invite_id}", status_code=204)
def revoke(album_id: str, invite_id: str, user: Auth, db: Db):
    album_access(db, album_id, user, owner=True)
    inv = db.scalar(select(m.Invite).where(m.Invite.id == invite_id).with_for_update())
    if not inv or inv.album_id != album_id:
        fail(404, "NOT_FOUND", "Invitation not found")
    inv.revoked = True


@router.post("/invites/redeem")
def redeem(body: s.Redeem, request: Request, user: Auth, db: Db):
    from .security import throttle

    throttle(db, "invite-user:" + user.id, limit=20)
    # Lock invitation before checking quota so concurrent redemptions cannot overrun max_uses.
    inv = db.scalar(
        select(m.Invite)
        .where(
            or_(
                m.Invite.token_hash == digest(body.secret),
                m.Invite.code_hash == digest(body.secret.upper()),
            )
        )
        .with_for_update()
    )
    if not inv or inv.revoked or inv.expires_at <= m.now():
        fail(404, "INVALID_INVITE", "Invitation is invalid or expired")
    album = db.scalar(select(m.Album).where(m.Album.id == inv.album_id).with_for_update())
    if album.deleted:
        fail(404, "INVALID_INVITE", "Invitation is invalid or expired")
    member = db.get(m.Member, (album.id, user.id))
    if album.owner_id == user.id or member:
        return {"album_id": album.id, "already_member": True}
    if inv.used_count >= inv.max_uses:
        fail(409, "INVITE_EXHAUSTED", "Invitation has reached its usage limit")
    inv.used_count += 1
    db.add(m.Member(album_id=album.id, user_id=user.id, role=inv.role))
    if not db.get(m.Redemption, (inv.id, user.id)):
        db.add(m.Redemption(invite_id=inv.id, user_id=user.id))
    return {"album_id": album.id, "already_member": False}


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


@router.put("/albums/{album_id}/memory-order")
def reorder(album_id: str, body: s.Reorder, user: Auth, db: Db):
    album, _ = album_access(db, album_id, user, owner=True, lock=True)
    version_check(album, body.expected_version)
    rows = db.scalars(
        select(m.Memory).where(m.Memory.album_id == album_id, m.Memory.deleted.is_(False))
    ).all()
    if len(body.ids) != len(set(body.ids)) or set(body.ids) != {x.id for x in rows}:
        fail(422, "INVALID_ORDER", "Send every active memory ID exactly once")
    positions = {ident: i for i, ident in enumerate(body.ids)}
    for row in rows:
        row.position = positions[row.id]
    return {"version": album.version}


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


@router.get("/memories/{memory_id}/comments")
def comments(
    memory_id: str,
    user: Auth,
    db: Db,
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=100),
):
    memory_access(db, memory_id, user)
    items, next_cursor = page(
        select(m.Comment).where(m.Comment.memory_id == memory_id), db, m.Comment.id, cursor, limit
    )
    return {"items": [comment_json(x) for x in items], "next_cursor": next_cursor}


def comment_json(c):
    return {k: getattr(c, k) for k in ("id", "memory_id", "author_id", "body", "version", "edited")}


@router.post("/memories/{memory_id}/comments", status_code=201)
def comment(memory_id: str, body: s.CommentCreate, user: Auth, db: Db):
    memory_access(db, memory_id, user, write=True, lock=True)
    item = m.Comment(memory_id=memory_id, author_id=user.id, body=nonblank(body.body))
    db.add(item)
    db.flush()
    return comment_json(item)


def comment_access(db, comment_id, user):
    c = db.get(m.Comment, comment_id)
    if not c:
        fail(404, "NOT_FOUND", "Comment not found")
    _, _, role = memory_access(db, c.memory_id, user, write=True, lock=True)
    return c, role


@router.patch("/comments/{comment_id}")
def edit_comment(comment_id: str, body: s.CommentEdit, user: Auth, db: Db):
    c, _ = comment_access(db, comment_id, user)
    db.refresh(c)
    if c.author_id != user.id:
        fail(403, "FORBIDDEN", "Only the author can edit a comment")
    version_check(c, body.expected_version)
    c.body, c.edited = nonblank(body.body), True
    return comment_json(c)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: str, user: Auth, db: Db):
    c, role = comment_access(db, comment_id, user)
    if role != "owner" and c.author_id != user.id:
        fail(403, "FORBIDDEN", "Only the author or owner can delete a comment")
    db.delete(c)


@router.put("/memories/{memory_id}/reaction", status_code=204)
def reaction(memory_id: str, body: s.ReactionSet, user: Auth, db: Db):
    from sqlalchemy.dialects.postgresql import insert

    memory_access(db, memory_id, user, write=True, lock=True)
    db.execute(
        insert(m.Reaction)
        .values(memory_id=memory_id, user_id=user.id, kind=body.kind)
        .on_conflict_do_update(index_elements=["memory_id", "user_id"], set_={"kind": body.kind})
    )


@router.delete("/memories/{memory_id}/reaction", status_code=204)
def unreact(memory_id: str, user: Auth, db: Db):
    memory_access(db, memory_id, user, write=True, lock=True)
    db.execute(
        delete(m.Reaction).where(m.Reaction.memory_id == memory_id, m.Reaction.user_id == user.id)
    )


@router.get("/memories/{memory_id}/reactions")
def reactions(memory_id: str, user: Auth, db: Db):
    memory_access(db, memory_id, user)
    counts = db.execute(
        select(m.Reaction.kind, func.count())
        .where(m.Reaction.memory_id == memory_id)
        .group_by(m.Reaction.kind)
    ).all()
    mine = db.get(m.Reaction, (memory_id, user.id))
    return {"counts": dict(counts), "mine": mine.kind if mine else None}
