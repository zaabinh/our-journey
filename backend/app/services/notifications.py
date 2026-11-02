"""PostgreSQL email outbox: queued inside the request transaction, delivered after commit.

Rows only exist if the triggering change commits. One background worker claims rows
with SKIP LOCKED, re-checks eligibility at send time, and retries with backoff.
"""

import logging
import threading
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from .. import models as m
from ..config import settings
from ..db import SessionLocal, after_commit
from .mail import send_email

logger = logging.getLogger(__name__)

# Security notices ignore the activity opt-out; everything else is optional activity.
SECURITY_KINDS = {"password_changed", "email_changed", "profile_updated", "suspicious_login"}
MAX_ATTEMPTS = 5
BACKOFF = [timedelta(minutes=1), timedelta(minutes=5), timedelta(minutes=30), timedelta(hours=2)]


def queue(
    db,
    kind: str,
    user_ids,
    context: dict,
    *,
    event: str | None = None,
    album_id: str | None = None,
    exclude=(),
) -> None:
    """Queue one email per distinct recipient. `event` dedupes across kinds for the same occurrence."""
    event = event or m.uid()
    category = "security" if kind in SECURITY_KINDS else "activity"
    for user_id in set(user_ids) - set(exclude) - {None}:
        db.execute(
            insert(m.EmailOutbox)
            .values(
                id=m.uid(),
                dedupe_key=f"{event}:{user_id}",
                kind=kind,
                category=category,
                user_id=user_id,
                album_id=album_id,
                context=context,
                status="pending",
                attempts=0,
                next_attempt_at=m.now(),
                created_at=m.now(),
            )
            .on_conflict_do_nothing(index_elements=["dedupe_key"])
        )
    after_commit(db, kick)


def album_audience(db, album) -> set[str]:
    members = db.scalars(select(m.Member.user_id).where(m.Member.album_id == album.id)).all()
    return {album.owner_id, *members}


def _skip_reason(db, row, user) -> str | None:
    if not user or not user.email_verified:
        return "RECIPIENT_UNAVAILABLE"
    if row.category == "activity" and not user.email_notifications:
        return "OPTED_OUT"
    if row.album_id:
        album = db.get(m.Album, row.album_id)
        if not album or album.deleted or user.id not in album_audience(db, album):
            return "NO_ACCESS"
    memory_id = row.context.get("memory_id")
    if memory_id:
        memory = db.get(m.Memory, memory_id)
        if not memory or memory.deleted or not memory.published:
            return "NO_ACCESS"
    return None


def deliver_outbox(limit: int = 100, sender=send_email) -> dict:
    """Deliver due rows one at a time; safe to run from several processes at once."""
    result = {"sent": 0, "skipped": 0, "retrying": 0, "failed": 0}
    with SessionLocal() as db:
        for _ in range(limit):
            row = db.scalar(
                select(m.EmailOutbox)
                .where(m.EmailOutbox.status == "pending", m.EmailOutbox.next_attempt_at <= m.now())
                .order_by(m.EmailOutbox.created_at)
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            if not row:
                break
            user = db.get(m.User, row.user_id)
            reason = _skip_reason(db, row, user)
            if reason:
                row.status, row.last_error = "skipped", reason
                result["skipped"] += 1
            else:
                try:
                    sender(
                        user.email,
                        row.kind,
                        row.context,
                        name=user.display_name,
                        idempotency_key=row.id,
                    )
                    row.status, row.last_error = "sent", None
                    result["sent"] += 1
                except Exception as exc:
                    row.attempts += 1
                    detail = exc.detail if isinstance(exc, HTTPException) else None
                    row.last_error = (
                        detail.get("code") if isinstance(detail, dict) else None
                    ) or type(exc).__name__
                    if row.attempts >= MAX_ATTEMPTS:
                        row.status = "failed"
                        result["failed"] += 1
                    else:
                        row.next_attempt_at = m.now() + BACKOFF[row.attempts - 1]
                        result["retrying"] += 1
                    # Kind and error code only: no address, body, or link.
                    logger.warning(
                        "Outbox %s attempt %s failed: %s", row.kind, row.attempts, row.last_error
                    )
            db.commit()
    return result


def _seconds_until_next_retry() -> float | None:
    with SessionLocal() as db:
        due = db.scalar(
            select(func.min(m.EmailOutbox.next_attempt_at)).where(m.EmailOutbox.status == "pending")
        )
    return None if due is None else max((due - m.now()).total_seconds(), 1)


_wake = threading.Event()
_running = threading.Lock()


def kick() -> None:
    """Wake the single in-process worker; it stays alive while retries are pending."""
    if settings().environment == "test":
        return
    _wake.set()
    if _running.acquire(blocking=False):
        threading.Thread(target=_worker, name="email-outbox", daemon=True).start()


def _worker() -> None:
    try:
        while True:
            _wake.clear()
            deliver_outbox()
            delay = _seconds_until_next_retry()
            if delay is None:
                break
            _wake.wait(timeout=min(delay, 900))
    except Exception as exc:
        logger.warning("Outbox worker stopped: %s", type(exc).__name__)
    finally:
        _running.release()
    if _wake.is_set():
        kick()
