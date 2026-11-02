import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings().database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    connect_args={"prepare_threshold": None},
)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def after_commit(db, callback):
    """Run `callback` once the request transaction commits; dropped on rollback."""
    callbacks = db.info.setdefault("after_commit", [])
    if callback not in callbacks:
        callbacks.append(callback)


def get_db():
    with SessionLocal() as db:
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        for callback in db.info.pop("after_commit", []):
            try:
                callback()
            except Exception as exc:
                # The change is committed; a follow-up failure must not turn into a 500.
                logger.warning("After-commit task failed: %s", type(exc).__name__)
