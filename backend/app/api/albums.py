# ruff: noqa: F403,F405
from fastapi import APIRouter
from .common import *

router = APIRouter()


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
    if "cover_photo_id" in body.model_fields_set:
        if body.cover_photo_id is not None:
            photo = db.get(m.Photo, body.cover_photo_id)
            memory = db.get(m.Memory, photo.memory_id) if photo and photo.memory_id else None
            if (
                not photo
                or photo.status != "ready"
                or not memory
                or memory.album_id != album.id
                or memory.deleted
            ):
                fail(422, "INVALID_COVER", "Cover must be a ready photo in this album")
        album.cover_photo_id = body.cover_photo_id
    return album_json(album, "owner")


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
def invites(
    album_id: str,
    user: Auth,
    db: Db,
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=100),
):
    album, _ = album_access(db, album_id, user, owner=True)
    query = select(m.Invite).where(m.Invite.album_id == album_id)
    rows, next_cursor = page(query, db, m.Invite.id, cursor, limit)
    return {
        "next_cursor": next_cursor,
        "items": [
            {
                k: getattr(i, k)
                for k in ("id", "role", "expires_at", "revoked", "used_count", "max_uses")
            }
            for i in rows
        ],
        "album_title": album.title,
    }


@router.post("/invites/preview")
def preview_invite(body: s.Redeem, user: Auth, db: Db):
    del user
    inv = db.scalar(
        select(m.Invite).where(
            or_(
                m.Invite.token_hash == digest(body.secret),
                m.Invite.code_hash == digest(body.secret.upper()),
            )
        )
    )
    if not inv:
        return {"status": "invalid"}
    album = db.get(m.Album, inv.album_id)
    if not album or album.deleted:
        return {"status": "invalid"}
    status = "revoked" if inv.revoked else "expired" if inv.expires_at <= m.now() else "active"
    return {
        "status": status,
        "album_id": album.id,
        "title": album.title,
        "role": inv.role,
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
    from ..security import throttle

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
