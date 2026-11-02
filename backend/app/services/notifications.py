"""Small event-to-email helpers; delivery failures never block application writes."""

from sqlalchemy import select

from .. import models as m
from ..config import settings
from .mail import send_notification


def notify(db, user_id: str, *, subject: str, title: str, paragraphs: list[str], path: str):
    user = db.get(m.User, user_id)
    if not user or not user.email_verified:
        return False
    url = f"{settings().public_web_url.rstrip('/')}/{path.lstrip('/')}"
    return send_notification(
        user.email,
        subject=subject,
        title=title,
        paragraphs=paragraphs,
        action_label="Mo Our Journey",
        action_url=url,
    )


def notify_album_members(
    db,
    album_id: str,
    excluded_user_ids: set[str],
    *,
    subject: str,
    title: str,
    paragraphs: list[str],
    path: str,
):
    album = db.get(m.Album, album_id)
    if not album:
        return
    recipients = set(
        db.scalars(select(m.Member.user_id).where(m.Member.album_id == album_id)).all()
    )
    recipients.add(album.owner_id)
    for user_id in recipients - excluded_user_ids:
        notify(
            db,
            user_id,
            subject=subject,
            title=title,
            paragraphs=[*paragraphs, f"Album: {album.title}"],
            path=path,
        )
