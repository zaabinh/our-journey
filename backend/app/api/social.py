# ruff: noqa: F403,F405
from fastapi import APIRouter
from .common import *

router = APIRouter()


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
    items = db.scalars(
        select(m.Reaction).where(m.Reaction.memory_id == memory_id).order_by(m.Reaction.user_id)
    ).all()
    counts = db.execute(
        select(m.Reaction.kind, func.count())
        .where(m.Reaction.memory_id == memory_id)
        .group_by(m.Reaction.kind)
    ).all()
    mine = db.get(m.Reaction, (memory_id, user.id))
    return {
        "counts": dict(counts),
        "mine": mine.kind if mine else None,
        "items": [{"user_id": item.user_id, "kind": item.kind} for item in items],
    }


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
