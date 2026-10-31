import hashlib
import secrets
from datetime import timedelta

from fastapi import Depends, Request
from pwdlib import PasswordHash
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session as DB

from .config import settings
from .db import get_db
from .errors import fail
from .models import RateLimit, Session, User, now

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("not-a-real-account-password")
COOKIE = "oj_session"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def check_origin(request: Request):
    if request.headers.get("origin") not in settings().allowed_origins:
        fail(403, "INVALID_ORIGIN", "Request origin is not allowed")


def authenticated(request: Request, db: DB = Depends(get_db)):
    token = request.cookies.get(COOKIE, "")
    session = db.scalar(select(Session).where(Session.token_hash == digest(token)))
    if not session or session.expires_at <= now():
        fail(401, "UNAUTHENTICATED", "Please sign in")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        check_origin(request)
        if not secrets.compare_digest(
            session.csrf_hash, digest(request.headers.get("x-csrf-token", ""))
        ):
            fail(403, "CSRF_FAILED", "Invalid CSRF token")
    request.state.session = session
    return db.get(User, session.user_id)


def throttle(db, key, limit=10, seconds=300):
    # Fixed time buckets + PostgreSQL atomic upsert work across processes.
    bucket = int(now().timestamp()) // seconds
    hashed = digest(f"{key}:{bucket}")
    stmt = (
        insert(RateLimit)
        .values(key=hashed, count=1, expires_at=now() + timedelta(seconds=seconds * 2))
        .on_conflict_do_update(index_elements=[RateLimit.key], set_={"count": RateLimit.count + 1})
        .returning(RateLimit.count)
    )
    count = db.scalar(stmt)
    db.commit()  # Failed authentication must not roll back the rate limit.
    if count > limit:
        fail(429, "RATE_LIMITED", "Try again later", headers={"Retry-After": str(seconds)})


def limit_auth(request, db, identifier):
    ip = request.client.host if request.client else "unknown"
    throttle(db, "auth-ip:" + ip, limit=60)
    throttle(db, "auth-id:" + identifier.strip().lower(), limit=10)


def find_login(db, value):
    value = value.strip().lower()
    return db.scalar(select(User).where(or_(User.email == value, User.username == value)))
