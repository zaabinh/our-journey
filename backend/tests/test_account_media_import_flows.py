import base64
import json
from io import BytesIO

from PIL import Image
from sqlalchemy import select
from fastapi.testclient import TestClient

from app import models as m
from app.db import SessionLocal
from app.import_legacy import run as import_legacy
from app.main import app
from conftest import ORIGIN


def png_bytes(color="red"):
    stream = BytesIO()
    Image.new("RGB", (32, 24), color).save(stream, "PNG")
    return stream.getvalue()


def upload_photo(actor, memory_id, color):
    response = actor.call(
        "POST",
        f"/memories/{memory_id}/photos",
        files={"file": ("photo.png", png_bytes(color), "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_email_verification_resend_and_password_reset_are_single_use(monkeypatch):
    links = []
    monkeypatch.setattr(
        "app.api.auth.send_account_link",
        lambda email, purpose, token: links.append((email, purpose, token)),
    )
    client = TestClient(app)
    payload = {
        "email": "account@example.test",
        "username": "account_test",
        "display_name": "Account Test",
        "password": "Example-password-2026",
    }
    registered = client.post("/api/v1/auth/register", headers=ORIGIN, json=payload)
    assert registered.status_code == 201
    assert registered.json() == {"status": "verification_sent"}
    with SessionLocal() as db:
        user = db.scalar(select(m.User).where(m.User.email == payload["email"]))
        assert user and not user.email_verified
        token_row = db.scalar(select(m.AccountToken).where(m.AccountToken.user_id == user.id))
        assert token_row and token_row.token_hash != links[-1][2]

    resent = client.post(
        "/api/v1/auth/resend-verification",
        headers=ORIGIN,
        json={"email": payload["email"]},
    )
    assert resent.status_code == 200
    assert links[-1][1] == "verify_email"
    verified = client.post(
        "/api/v1/auth/verify-email",
        headers=ORIGIN,
        json={"token": links[-1][2]},
    )
    assert verified.status_code == 200
    assert (
        client.post(
            "/api/v1/auth/verify-email", headers=ORIGIN, json={"token": links[-1][2]}
        ).status_code
        == 400
    )
    with SessionLocal() as db:
        user = db.scalar(select(m.User).where(m.User.email == payload["email"]))
        assert user.email_verified

    old_login = client.post(
        "/api/v1/auth/login",
        headers=ORIGIN,
        json={"identifier": payload["email"], "password": payload["password"]},
    )
    assert old_login.status_code == 200
    reset_requested = client.post(
        "/api/v1/auth/password-reset/request",
        headers=ORIGIN,
        json={"email": payload["email"]},
    )
    assert reset_requested.status_code == 200
    assert links[-1][1] == "reset_password"
    reset = client.post(
        "/api/v1/auth/password-reset/confirm",
        headers=ORIGIN,
        json={"token": links[-1][2], "password": "Different-password-2026"},
    )
    assert reset.status_code == 200
    assert client.get("/api/v1/auth/session", headers=ORIGIN).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login",
            headers=ORIGIN,
            json={"identifier": payload["email"], "password": payload["password"]},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            headers=ORIGIN,
            json={"identifier": payload["email"], "password": "Different-password-2026"},
        ).status_code
        == 200
    )


def test_avatar_upload_read_and_delete_persist_state(actors):
    actor = actors["owner"]
    first = actor.call(
        "POST", "/users/me/avatar", files={"file": ("avatar.png", png_bytes(), "image/png")}
    )
    assert first.status_code == 201, first.text
    first_id = first.json()["photo_id"]
    second = actor.call(
        "POST", "/users/me/avatar", files={"file": ("avatar.png", png_bytes("blue"), "image/png")}
    )
    assert second.status_code == 201, second.text
    second_id = second.json()["photo_id"]
    profile = actor.call("GET", "/users/me").json()
    assert profile["avatar_photo_id"] == second_id
    with SessionLocal() as db:
        old, current = db.get(m.Photo, first_id), db.get(m.Photo, second_id)
        assert old.status == "deleting" and old.owner_id == actor.user["id"]
        assert current.status == "ready" and current.memory_id is None
        assert db.get(m.User, actor.user["id"]).avatar_photo_id == second_id
    read_url = actor.call("POST", f"/photos/{second_id}/read-url")
    assert read_url.status_code == 200
    content = actor.call("GET", f"/photos/{second_id}/content")
    assert content.status_code == 200 and content.content.startswith(b"\xff\xd8")
    deleted = actor.call("DELETE", "/users/me/avatar")
    assert deleted.status_code == 204
    with SessionLocal() as db:
        assert db.get(m.User, actor.user["id"]).avatar_photo_id is None
        assert db.get(m.Photo, second_id).status == "deleting"


def test_album_cover_date_filter_and_photo_order_read_write_db(actors):
    actor = actors["owner"]
    album = actor.album()
    memory_2020 = actor.call(
        "POST", f"/albums/{album['id']}/memories", json={"title": "Older", "date": "2020-01-02"}
    ).json()
    memory_2022 = actor.call(
        "POST", f"/albums/{album['id']}/memories", json={"title": "Newer", "date": "2022-08-09"}
    ).json()
    legacy = actor.call(
        "POST",
        f"/albums/{album['id']}/memories",
        json={"title": "Legacy date", "date": None, "date_label": "Old date label"},
    ).json()
    filtered = actor.call(
        "GET", f"/albums/{album['id']}/memories?date_from=2021-01-01&date_to=2023-01-01"
    )
    assert [row["id"] for row in filtered.json()["items"]] == [memory_2022["id"]]
    assert filtered.json()["items"][0]["date_label"] is None
    assert (
        actor.call(
            "GET", f"/albums/{album['id']}/memories?date_from=2023-01-01&date_to=2021-01-01"
        ).status_code
        == 422
    )
    assert actor.call("GET", f"/memories/{legacy['id']}").json()["date_label"] == "Old date label"

    photo_ids = [
        upload_photo(actor, memory_2020["id"], color) for color in ("red", "green", "blue")
    ]
    published = actor.call("POST", f"/memories/{memory_2020['id']}/publish")
    assert published.status_code == 200
    reordered = actor.call(
        "PUT",
        f"/memories/{memory_2020['id']}/photo-order",
        json={"ids": list(reversed(photo_ids)), "expected_version": published.json()["version"]},
    )
    assert reordered.status_code == 200
    assert reordered.json()["memory_version"] == published.json()["version"] + 1
    photo_list = actor.call("GET", f"/memories/{memory_2020['id']}/photos").json()["items"]
    assert [photo["id"] for photo in photo_list] == list(reversed(photo_ids))
    assert [photo["position"] for photo in photo_list] == [0, 1, 2]
    with SessionLocal() as db:
        persisted = db.get(m.Memory, memory_2020["id"])
        assert persisted.version == reordered.json()["memory_version"]
        assert {
            p.id: p.position
            for p in db.scalars(select(m.Photo).where(m.Photo.memory_id == persisted.id))
        } == {
            photo_ids[0]: 2,
            photo_ids[1]: 1,
            photo_ids[2]: 0,
        }

    cover_photo_id = photo_ids[0]
    current_album = actor.call("GET", f"/albums/{album['id']}").json()
    edit_cover = actor.call(
        "PATCH",
        f"/albums/{album['id']}",
        json={
            "title": album["title"],
            "description": "",
            "cover_photo_id": cover_photo_id,
            "expected_version": current_album["version"],
        },
    )
    assert edit_cover.status_code == 200 and edit_cover.json()["cover_photo_id"] == cover_photo_id
    assert (
        actor.call(
            "PATCH",
            f"/albums/{album['id']}",
            json={
                "title": album["title"],
                "description": "",
                "cover_photo_id": None,
                "expected_version": edit_cover.json()["version"],
            },
        ).json()["cover_photo_id"]
        is None
    )
    with SessionLocal() as db:
        assert db.get(m.Album, album["id"]).cover_photo_id is None


def test_legacy_import_writes_and_resumes_without_duplicate_rows(actors, tmp_path):
    actor = actors["owner"]
    album_id = actor.album()["id"]
    image = base64.b64encode(png_bytes("purple")).decode("ascii")
    record = {
        "id": "legacy-db-test",
        "authorId": "legacy-owner",
        "title": "Imported fixture",
        "date": "",
        "dateLabel": "Legacy date label",
        "location": "Fixture location",
        "note": "Synthetic import only",
        "animations": {"heart": True},
        "order": 7,
        "photoIds": ["legacy-db-photo"],
        "legacyField": {"preserve": True},
    }
    source = tmp_path / "legacy.json"
    exported = {
        "version": 1,
        "manifest": {},
        "data": {
            "memories": [record],
            "photos": [{"id": "legacy-db-photo", "mime": "image/png", "data": image}],
        },
    }
    source.write_text(json.dumps(exported), encoding="utf-8")
    mapping = {"legacy-owner": actor.user["id"]}

    first = import_legacy(source, None, "synthetic-test", album_id, mapping, True)
    assert first["errors"] == 0 and first["applied"] == 1
    resumed = import_legacy(source, None, "synthetic-test", album_id, mapping, True)
    assert resumed["errors"] == 0 and resumed["resumed"] == 1
    with SessionLocal() as db:
        memory = db.scalar(select(m.Memory).where(m.Memory.title == "Imported fixture"))
        photos = db.scalars(select(m.Photo).where(m.Photo.memory_id == memory.id)).all()
        checkpoint = db.scalar(
            select(m.MigrationItem).where(m.MigrationItem.source == "synthetic-test")
        )
        album = db.get(m.Album, album_id)
        assert memory.date is None and memory.date_label == "Legacy date label"
        assert memory.published and memory.position == 7 and memory.animations == {"heart": True}
        assert len(photos) == 1 and photos[0].status == "ready"
        assert album.cover_photo_id == photos[0].id
        assert checkpoint.extras["record"]["legacyField"] == {"preserve": True}
        assert "images" not in checkpoint.extras["record"]
        assert (
            db.scalar(select(m.Memory.id).where(m.Memory.title == "Imported fixture")) == memory.id
        )
