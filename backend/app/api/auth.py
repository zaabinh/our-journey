# ruff: noqa: F403,F405
from fastapi import APIRouter
from .common import *
from sqlalchemy import select
from ..services.mail import send_account_link
from ..services.media import persist_photo, remove_old_avatar

router = APIRouter()


@router.post("/auth/register", status_code=201)
def register(body: s.Register, request: Request, db: Db):
    check_origin(request)
    limit_auth(request, db, body.email)
    user = m.User(
        email=body.email,
        username=body.username,
        display_name=body.display_name,
        password_hash=passwords.hash(body.password),
        email_verified=False,
    )
    db.add(user)
    db.flush()
    issue_account_token(db, user, "verify_email")
    return {"status": "verification_sent"}


def issue_account_token(db, user, purpose):
    raw = secrets.token_urlsafe(32)
    db.execute(
        delete(m.AccountToken).where(
            m.AccountToken.user_id == user.id, m.AccountToken.purpose == purpose
        )
    )
    db.add(
        m.AccountToken(
            user_id=user.id,
            token_hash=digest(raw),
            purpose=purpose,
            expires_at=m.now() + timedelta(hours=1),
        )
    )
    db.flush()
    send_account_link(user.email, purpose, raw)


def consume_account_token(db, raw, purpose):
    token = db.scalar(
        select(m.AccountToken)
        .where(m.AccountToken.token_hash == digest(raw), m.AccountToken.purpose == purpose)
        .with_for_update()
    )
    if not token or token.consumed_at or token.expires_at <= m.now():
        fail(400, "INVALID_ACCOUNT_TOKEN", "This link is invalid or has expired")
    token.consumed_at = m.now()
    return db.get(m.User, token.user_id)


@router.post("/auth/verify-email")
def verify_email(body: s.AccountTokenRequest, request: Request, db: Db):
    check_origin(request)
    user = consume_account_token(db, body.token, "verify_email")
    user.email_verified = True
    return {"status": "verified"}


@router.post("/auth/resend-verification")
def resend_verification(body: s.EmailRequest, request: Request, db: Db):
    check_origin(request)
    limit_auth(request, db, body.email)
    user = db.scalar(select(m.User).where(m.User.email == body.email.strip().lower()))
    if user and not user.email_verified:
        issue_account_token(db, user, "verify_email")
    return {"status": "sent_if_account_requires_verification"}


@router.post("/auth/password-reset/request")
def request_password_reset(body: s.EmailRequest, request: Request, db: Db):
    check_origin(request)
    limit_auth(request, db, body.email)
    user = db.scalar(select(m.User).where(m.User.email == body.email.strip().lower()))
    if user and user.email_verified:
        issue_account_token(db, user, "reset_password")
    return {"status": "sent_if_account_exists"}


@router.post("/auth/password-reset/confirm")
def confirm_password_reset(body: s.PasswordReset, request: Request, db: Db):
    check_origin(request)
    user = consume_account_token(db, body.token, "reset_password")
    user.password_hash = passwords.hash(body.password)
    db.execute(delete(m.Session).where(m.Session.user_id == user.id))
    db.execute(delete(m.AccountToken).where(m.AccountToken.user_id == user.id))
    return {"status": "password_updated"}


@router.post("/auth/login")
def login(body: s.Login, request: Request, response: Response, db: Db):
    from ..security import find_login

    check_origin(request)
    limit_auth(request, db, body.identifier)
    user = find_login(db, body.identifier)
    valid = passwords.verify(body.password, user.password_hash if user else DUMMY_HASH)
    if not valid or not user:
        fail(401, "INVALID_CREDENTIALS", "Invalid credentials")
    if not user.email_verified:
        fail(403, "EMAIL_NOT_VERIFIED", "Verify your email before signing in")
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


@router.post("/users/me/avatar", status_code=201)
def upload_avatar(user: Auth, db: Db, file: UploadFile = File()):
    raw = file.file.read(settings().max_upload_bytes + 1)
    photo = persist_photo(db, raw, owner_id=user.id)
    remove_old_avatar(db, user, photo)
    return {"photo_id": photo.id}


@router.delete("/users/me/avatar", status_code=204)
def delete_avatar(user: Auth, db: Db):
    if user.avatar_photo_id:
        photo = db.get(m.Photo, user.avatar_photo_id)
        user.avatar_photo_id = None
        if photo and photo.status == "ready":
            queue_photo_delete(db, photo)
