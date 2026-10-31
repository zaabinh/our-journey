# ruff: noqa: F403,F405
from fastapi import APIRouter
from .common import *

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
    )
    db.add(user)
    db.flush()
    return public_user(user)


@router.post("/auth/login")
def login(body: s.Login, request: Request, response: Response, db: Db):
    from ..security import find_login

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
