import os
import pytest
from sqlalchemy import delete
from fastapi.testclient import TestClient

os.environ.setdefault("OJ_ENVIRONMENT", "test")
os.environ.setdefault("OJ_LOCAL_STORAGE_PATH", "/tmp/our-journey-test-uploads")
from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app import models  # noqa: F401,E402

ORIGIN = {"Origin": "http://localhost:5173"}


@pytest.fixture(autouse=True)
def clean_database(tmp_path, monkeypatch):
    from app.config import settings

    settings().local_storage_path = str(tmp_path / "uploads")
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))
    yield


class Actor:
    def __init__(self, name):
        self.client = TestClient(app)
        self.headers = dict(ORIGIN)
        r = self.client.post(
            "/api/v1/auth/register",
            headers=self.headers,
            json={
                "email": f"{name}@example.test",
                "username": name,
                "display_name": name,
                "password": "Example-password-2026",
            },
        )
        assert r.status_code == 201, r.text
        self.user = r.json()
        r = self.client.post(
            "/api/v1/auth/login",
            headers=self.headers,
            json={
                "identifier": name,
                "password": "Example-password-2026",
            },
        )
        assert r.status_code == 200, r.text
        self.headers["X-CSRF-Token"] = r.json()["csrf_token"]

    def call(self, method, path, **kwargs):
        return self.client.request(method, "/api/v1" + path, headers=self.headers, **kwargs)

    def album(self, title="Test album"):
        r = self.call("POST", "/albums", json={"title": title})
        assert r.status_code == 201, r.text
        return r.json()

    def join(self, owner, album, role="contributor"):
        invite = owner.call("POST", f"/albums/{album}/invites", json={"role": role}).json()
        r = self.call("POST", "/invites/redeem", json={"secret": invite["token"]})
        assert r.status_code == 200, r.text
        return invite

    def memory(self, album):
        r = self.call(
            "POST",
            f"/albums/{album}/memories",
            json={
                "title": "Memory",
                "date": "2020-02-29",
                "note": "A story",
            },
        )
        assert r.status_code == 201, r.text
        return r.json()


@pytest.fixture
def actors():
    return {name: Actor(name) for name in ("owner", "writer", "viewer", "outsider")}
