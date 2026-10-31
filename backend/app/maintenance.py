"""Run periodically: python -m app.maintenance. Never writes personal data to logs."""

from datetime import timedelta
from sqlalchemy import select, delete
from .db import SessionLocal
from .models import StorageJob, Photo, Session, RateLimit, now
from .storage import storage


def cleanup():
    from .config import settings

    settings().validate_runtime()
    succeeded, failed = 0, 0
    with SessionLocal() as db:
        db.execute(delete(Session).where(Session.expires_at < now()))
        db.execute(delete(RateLimit).where(RateLimit.expires_at < now()))
        db.commit()
        # Pending intents are quarantined for an hour to avoid a live upload.
        jobs = db.scalars(
            select(StorageJob)
            .where(StorageJob.done.is_(False), StorageJob.created_at < now() - timedelta(hours=1))
            .with_for_update(skip_locked=True)
            .limit(100)
        ).all()
        store = storage()
        for job in jobs:
            ready = db.scalar(
                select(Photo.id).where(
                    Photo.status == "ready",
                    (Photo.object_key == job.object_key) | (Photo.thumbnail_key == job.object_key),
                )
            )
            if ready:
                # A stale cleanup intent must never delete a ready object.
                job.done = True
                continue
            job.attempts += 1
            try:
                store.delete(job.object_key)
                job.done = True
                succeeded += 1
            except Exception:
                failed += 1
        db.commit()
    return {"deleted": succeeded, "failed": failed}


if __name__ == "__main__":
    print(cleanup())
