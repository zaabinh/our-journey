from datetime import timedelta
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
from sqlalchemy import select
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app import models as m
from conftest import Actor, ORIGIN


def image_bytes():
    output = BytesIO()
    Image.new("RGB", (64, 32), "green").save(output, "PNG")
    return output.getvalue()


def publish(actor, memory):
    result = actor.call(
        "POST",
        f"/memories/{memory}/photos",
        files={
            "file": ("photo.png", image_bytes(), "image/png"),
        },
    )
    assert result.status_code == 201, result.text
    result2 = actor.call("POST", f"/memories/{memory}/publish")
    assert result2.status_code == 200, result2.text
    return result.json()["id"]


def setup_album(actors):
    a = actors["owner"].album()["id"]
    actors["writer"].join(actors["owner"], a)
    actors["viewer"].join(actors["owner"], a, "viewer")
    return a


def test_auth_security_and_validation():
    user = Actor("sample")
    assert user.call("GET", "/auth/session").status_code == 200
    # Every tab receives the same CSRF token, GET does not invalidate other tabs.
    token = user.call("GET", "/auth/csrf").json()["csrf_token"]
    assert token == user.headers["X-CSRF-Token"]
    r = user.client.patch("/api/v1/users/me", headers=ORIGIN, json={"display_name": "name"})
    assert r.status_code == 403
    r = user.client.patch(
        "/api/v1/users/me",
        headers={
            "Origin": "https://attacker.test",
            "X-CSRF-Token": token,
        },
        json={"display_name": "name"},
    )
    assert r.status_code == 403
    r = user.client.post(
        "/api/v1/auth/register",
        headers=ORIGIN,
        json={
            "email": "SAMPLE@example.test",
            "username": "other",
            "display_name": "name",
            "password": "Example-password-2026",
        },
    )
    assert r.status_code == 409
    assert "password_hash" not in user.call("GET", "/users/me").text
    raw_cookie = user.client.cookies.get("oj_session")
    assert user.call("POST", "/auth/logout").status_code == 204
    user.client.cookies.set("oj_session", raw_cookie)
    assert user.call("GET", "/auth/session").status_code == 401


def test_error_does_not_echo_password():
    c = TestClient(app)
    secret = "sensitive-short"
    r = c.post(
        "/api/v1/auth/register",
        headers=ORIGIN,
        json={
            "email": "bad",
            "username": "a",
            "display_name": "x",
            "password": secret,
        },
    )
    assert r.status_code == 422
    assert secret not in r.text
    assert r.json()["error"]["request_id"] == r.headers["x-request-id"]


def test_expired_session():
    a = Actor("expiring")
    with SessionLocal.begin() as db:
        for row in db.scalars(select(m.Session)):
            row.expires_at = m.now() - timedelta(seconds=1)
    assert a.call("GET", "/auth/session").status_code == 401


def test_login_rate_limit():
    c = TestClient(app)
    for _ in range(10):
        assert (
            c.post(
                "/api/v1/auth/login",
                headers=ORIGIN,
                json={
                    "identifier": "missing",
                    "password": "wrong",
                },
            ).status_code
            == 401
        )
    r = c.post(
        "/api/v1/auth/login",
        headers=ORIGIN,
        json={
            "identifier": "missing",
            "password": "wrong",
        },
    )
    assert r.status_code == 429
    assert "retry-after" in r.headers


def test_role_matrix_and_revocation(actors):
    album = setup_album(actors)
    assert actors["outsider"].call("GET", f"/albums/{album}").status_code == 404
    assert (
        actors["viewer"]
        .call(
            "POST",
            f"/albums/{album}/memories",
            json={
                "title": "No",
                "date": "2026-01-01",
            },
        )
        .status_code
        == 403
    )
    memory = actors["writer"].memory(album)
    photo = publish(actors["writer"], memory["id"])
    assert actors["viewer"].call("GET", f"/memories/{memory['id']}").status_code == 200
    assert actors["outsider"].call("POST", f"/photos/{photo}/read-url").status_code == 404
    assert actors["viewer"].call("GET", f"/photos/{photo}/content").status_code == 200
    assert actors["owner"].call("POST", f"/albums/{album}/leave").status_code == 409
    assert (
        actors["owner"]
        .call("DELETE", f"/albums/{album}/members/{actors['owner'].user['id']}")
        .status_code
        == 409
    )
    actors["owner"].call("DELETE", f"/albums/{album}/members/{actors['writer'].user['id']}")
    assert actors["writer"].call("GET", f"/photos/{photo}/content").status_code == 404


def test_cross_album_and_version(actors):
    owner, writer = actors["owner"], actors["writer"]
    a, b = owner.album()["id"], writer.album()["id"]
    mem = owner.memory(a)
    assert writer.call("GET", f"/memories/{mem['id']}").status_code == 404
    assert (
        owner.call(
            "PUT",
            f"/albums/{a}/memory-order",
            json={
                "ids": [writer.memory(b)["id"]],
                "expected_version": 2,
            },
        ).status_code
        == 422
    )
    result = owner.call(
        "PATCH",
        f"/memories/{mem['id']}",
        json={
            "title": "Edited",
            "date": "2020-02-29",
            "expected_version": 1,
        },
    )
    assert result.status_code == 200
    assert result.json()["date"] == "2020-02-29"
    assert (
        owner.call(
            "PATCH",
            f"/memories/{mem['id']}",
            json={
                "title": "Stale",
                "date": "2020-02-29",
                "expected_version": 1,
            },
        ).status_code
        == 409
    )


def test_invites_expiry_revoke_and_redeem_race(actors):
    owner = actors["owner"]
    album = owner.album()["id"]
    inv = owner.call(
        "POST",
        f"/albums/{album}/invites",
        json={
            "role": "contributor",
            "max_uses": 1,
        },
    ).json()
    users = [actors["writer"], actors["viewer"]]
    with ThreadPoolExecutor(2) as pool:
        results = list(
            pool.map(
                lambda u: (
                    u.call(
                        "POST",
                        "/invites/redeem",
                        json={
                            "secret": inv["code"],
                        },
                    ).status_code
                ),
                users,
            )
        )
    assert sorted(results) == [200, 409]
    winner = users[results.index(200)]
    assert winner.call(
        "POST",
        "/invites/redeem",
        json={
            "secret": inv["token"],
        },
    ).json()["already_member"]
    owner.call("DELETE", f"/albums/{album}/invites/{inv['id']}")
    assert winner.call("POST", "/invites/redeem", json={"secret": inv["token"]}).status_code == 404
    inv2 = owner.call("POST", f"/albums/{album}/invites", json={"role": "viewer"}).json()
    with SessionLocal.begin() as db:
        db.get(m.Invite, inv2["id"]).expires_at = m.now() - timedelta(seconds=1)
    assert winner.call("POST", "/invites/redeem", json={"secret": inv2["token"]}).status_code == 404


def test_comments_and_idempotent_reactions(actors):
    album = setup_album(actors)
    owner, writer, viewer = (actors[k] for k in ("owner", "writer", "viewer"))
    mem = writer.memory(album)["id"]
    publish(writer, mem)
    comment = writer.call("POST", f"/memories/{mem}/comments", json={"body": "hello"}).json()
    assert (
        owner.call(
            "PATCH",
            f"/comments/{comment['id']}",
            json={
                "body": "impersonate",
                "expected_version": 1,
            },
        ).status_code
        == 403
    )
    assert viewer.call("POST", f"/memories/{mem}/comments", json={"body": "no"}).status_code == 403
    assert writer.call(
        "PATCH",
        f"/comments/{comment['id']}",
        json={
            "body": "edited",
            "expected_version": 1,
        },
    ).json()["edited"]
    assert owner.call("DELETE", f"/comments/{comment['id']}").status_code == 204
    for _ in range(2):
        assert (
            writer.call("PUT", f"/memories/{mem}/reaction", json={"kind": "heart"}).status_code
            == 204
        )
    assert writer.call("GET", f"/memories/{mem}/reactions").json()["counts"] == {"heart": 1}
    writer.call("PUT", f"/memories/{mem}/reaction", json={"kind": "like"})
    assert writer.call("GET", f"/memories/{mem}/reactions").json()["counts"] == {"like": 1}
    assert viewer.call("PUT", f"/memories/{mem}/reaction", json={"kind": "like"}).status_code == 403


def test_upload_validation_failure_and_cleanup(actors, monkeypatch):
    owner = actors["owner"]
    mem = owner.memory(owner.album()["id"])["id"]
    assert owner.call("POST", f"/memories/{mem}/publish").status_code == 409
    assert (
        owner.call(
            "POST",
            f"/memories/{mem}/photos",
            files={
                "file": ("fake.jpg", b"<html>bad</html>", "image/jpeg"),
            },
        ).status_code
        == 422
    )
    from app.storage import LocalStorage

    def fail_put(*args):
        raise OSError("storage offline")

    monkeypatch.setattr(LocalStorage, "put", fail_put)
    assert (
        owner.call(
            "POST",
            f"/memories/{mem}/photos",
            files={
                "file": ("real.png", image_bytes(), "image/png"),
            },
        ).status_code
        == 503
    )
    with SessionLocal() as db:
        assert len(db.scalars(select(m.StorageJob)).all()) == 2
    assert owner.call("POST", f"/memories/{mem}/publish").status_code == 409
    assert owner.call("GET", f"/memories/{mem}/photos").json()["items"] == []


def test_delete_album_blocks_photo_before_cleanup(actors):
    owner = actors["owner"]
    album = owner.album()["id"]
    memory = owner.memory(album)["id"]
    photo = publish(owner, memory)
    assert owner.call("DELETE", f"/photos/{photo}").status_code == 409
    assert owner.call("DELETE", f"/albums/{album}").status_code == 204
    assert owner.call("GET", f"/photos/{photo}/content").status_code == 404
    with SessionLocal() as db:
        assert len(db.scalars(select(m.StorageJob)).all()) == 2


def test_pagination_and_reorder_preserves_records(actors):
    owner = actors["owner"]
    a = owner.album()["id"]
    ids = [owner.memory(a)["id"] for _ in range(3)]
    version = owner.call("GET", f"/albums/{a}").json()["version"]
    assert (
        owner.call(
            "PUT",
            f"/albums/{a}/memory-order",
            json={
                "ids": ids[::-1],
                "expected_version": version,
            },
        ).status_code
        == 200
    )
    first = owner.call("GET", f"/albums/{a}/memories?limit=2").json()
    second = owner.call(
        "GET",
        f"/albums/{a}/memories",
        params={
            "limit": 2,
            "cursor": first["next_cursor"],
        },
    ).json()
    assert [x["id"] for x in first["items"] + second["items"]] == ids[::-1]
