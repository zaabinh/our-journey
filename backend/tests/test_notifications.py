from datetime import timedelta

from sqlalchemy import select, update

from app import models as m
from app.db import SessionLocal
from app.services.notifications import MAX_ATTEMPTS, deliver_outbox
from test_account_media_import_flows import upload_photo


class FakeSender:
    def __init__(self, failures=0):
        self.sent, self.keys, self.failures = [], [], failures

    def __call__(self, address, kind, context, *, name, idempotency_key):
        self.keys.append(idempotency_key)
        if self.failures:
            self.failures -= 1
            raise RuntimeError("Resend down")
        self.sent.append((address.split("@")[0], kind, name))


def rows(kind=None):
    with SessionLocal() as db:
        query = select(m.EmailOutbox).order_by(m.EmailOutbox.created_at)
        if kind:
            query = query.where(m.EmailOutbox.kind == kind)
        return db.scalars(query).all()


def album_with_members(actors):
    owner = actors["owner"]
    album = owner.album("Đà Lạt")["id"]
    actors["writer"].join(owner, album, "contributor")
    actors["viewer"].join(owner, album, "viewer")
    return album


def published_memory(actor, album):
    memory = actor.memory(album)["id"]
    upload_photo(actor, memory, "red")
    assert actor.call("POST", f"/memories/{memory}/publish").status_code == 200
    return memory


def test_publish_notifies_other_members_once(actors):
    album = album_with_members(actors)
    deliver_outbox(sender=FakeSender())  # flush join notices
    memory = published_memory(actors["writer"], album)
    assert actors["writer"].call("POST", f"/memories/{memory}/publish").status_code == 200

    fake = FakeSender()
    deliver_outbox(sender=fake)
    assert sorted(fake.sent) == [
        ("owner", "memory_published", "owner"),
        ("viewer", "memory_published", "viewer"),
    ]
    deliver_outbox(sender=fake)
    assert len(fake.sent) == 2  # republish and a second worker pass add nothing


def test_comment_author_and_mentions_are_deduplicated(actors):
    album = album_with_members(actors)
    memory = published_memory(actors["writer"], album)
    deliver_outbox(sender=FakeSender())
    body = "@writer @viewer @outsider @owner xem nè"
    assert (
        actors["owner"]
        .call("POST", f"/memories/{memory}/comments", json={"body": body})
        .status_code
        == 201
    )

    fake = FakeSender()
    deliver_outbox(sender=fake)
    # Author gets one email despite the mention; outsiders and the commenter get none.
    assert sorted(fake.sent) == [
        ("viewer", "comment_mention", "viewer"),
        ("writer", "comment_new", "writer"),
    ]
    assert rows("comment_new")[0].context["excerpt"] == body


def test_opt_out_skips_activity_but_not_security_notices(actors):
    viewer = actors["viewer"]
    response = viewer.call(
        "PATCH", "/users/me", json={"display_name": "Vy", "email_notifications": False}
    )
    assert response.status_code == 200 and response.json()["email_notifications"] is False
    album = album_with_members(actors)
    published_memory(actors["writer"], album)

    fake = FakeSender()
    deliver_outbox(sender=fake)
    assert ("viewer", "profile_updated", "Vy") in fake.sent
    assert not [x for x in fake.sent if x[0] == "viewer" and x[1] == "memory_published"]
    assert {r.last_error for r in rows("memory_published") if r.status == "skipped"} == {
        "OPTED_OUT"
    }


def test_access_is_rechecked_at_delivery_and_removal_is_still_sent(actors):
    album = album_with_members(actors)
    published_memory(actors["writer"], album)
    viewer_id = actors["viewer"].user["id"]
    assert actors["owner"].call("DELETE", f"/albums/{album}/members/{viewer_id}").status_code == 204

    fake = FakeSender()
    deliver_outbox(sender=fake)
    viewer_mail = [x[1] for x in fake.sent if x[0] == "viewer"]
    assert viewer_mail == ["member_removed"]
    skipped = [r for r in rows("memory_published") if r.user_id == viewer_id]
    assert skipped[0].status == "skipped" and skipped[0].last_error == "NO_ACCESS"


def test_membership_changes_notify_the_right_person(actors):
    owner, writer = actors["owner"], actors["writer"]
    album = album_with_members(actors)
    assert [r.user_id for r in rows("invite_accepted")] == [owner.user["id"]] * 2
    owner.call("PATCH", f"/albums/{album}/members/{writer.user['id']}", json={"role": "viewer"})
    owner.call("PATCH", f"/albums/{album}/members/{writer.user['id']}", json={"role": "viewer"})
    assert writer.call("POST", f"/albums/{album}/leave").status_code == 204

    changed = rows("member_role_changed")
    assert len(changed) == 1 and changed[0].context["old_role"] == "contributor"
    assert [r.user_id for r in rows("member_left")] == [owner.user["id"]]


def test_failed_delivery_retries_with_same_idempotency_key(actors):
    actors["viewer"].call("PATCH", "/users/me", json={"display_name": "Vy"})
    fake = FakeSender(failures=1)
    assert deliver_outbox(sender=fake)["retrying"] == 1
    row = rows("profile_updated")[0]
    assert row.status == "pending" and row.attempts == 1 and row.next_attempt_at > m.now()
    assert deliver_outbox(sender=fake)["sent"] == 0  # backoff not elapsed

    with SessionLocal.begin() as db:
        db.execute(update(m.EmailOutbox).values(next_attempt_at=m.now() - timedelta(seconds=1)))
    assert deliver_outbox(sender=fake)["sent"] == 1
    assert fake.keys == [row.id, row.id]


def test_delivery_gives_up_after_max_attempts(actors):
    actors["viewer"].call("PATCH", "/users/me", json={"display_name": "Vy"})
    fake = FakeSender(failures=MAX_ATTEMPTS)
    for _ in range(MAX_ATTEMPTS):
        with SessionLocal.begin() as db:
            db.execute(update(m.EmailOutbox).values(next_attempt_at=m.now() - timedelta(seconds=1)))
        deliver_outbox(sender=fake)
    row = rows("profile_updated")[0]
    assert (
        row.status == "failed" and row.attempts == MAX_ATTEMPTS and row.last_error == "RuntimeError"
    )


def test_invite_email_is_sent_after_commit_without_storing_the_token(actors, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.api.albums.send_best_effort",
        lambda address, kind, context, name=None: sent.append((address, kind, context, name)),
    )
    owner = actors["owner"]
    album = owner.album("Huế")["id"]
    invite = owner.call(
        "POST",
        f"/albums/{album}/invites",
        json={"role": "viewer", "recipient_email": "Viewer@Example.test"},
    ).json()
    owner.call(
        "POST",
        f"/albums/{album}/invites",
        json={"role": "viewer", "recipient_email": "owner@example.test"},
    )

    assert len(sent) == 1  # self-invite skipped
    address, kind, context, name = sent[0]
    assert (address, kind, name, context["role"]) == (
        "viewer@example.test",
        "invite",
        "viewer",
        "viewer",
    )
    assert context["url"].endswith(f"/join/{invite['token']}")
    assert not [r for r in rows() if invite["token"] in str(r.context)]


def test_password_reset_queues_security_notice_and_keeps_token_flow(actors, monkeypatch):
    links = []
    monkeypatch.setattr(
        "app.api.auth.send_account_link",
        lambda email, purpose, token, name=None: links.append((purpose, token, name)),
    )
    viewer = actors["viewer"]
    assert (
        viewer.call(
            "POST", "/auth/password-reset/request", json={"email": "viewer@example.test"}
        ).status_code
        == 200
    )
    purpose, token, name = links[-1]
    assert (purpose, name) == ("reset_password", "viewer")
    confirm = viewer.call(
        "POST",
        "/auth/password-reset/confirm",
        json={"token": token, "password": "New-password-2026"},
    )
    assert confirm.status_code == 200

    notice = rows("password_changed")
    assert len(notice) == 1 and notice[0].category == "security" and notice[0].context == {}
    assert token not in str([r.context for r in rows()])
