from datetime import UTC, date, datetime
from uuid import uuid4

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


def uid():
    return str(uuid4())


def now():
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(Text)


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RateLimit(Base):
    __tablename__ = "rate_limits"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(default=1)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Album(Base):
    __tablename__ = "albums"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    version: Mapped[int] = mapped_column(default=1)
    deleted: Mapped[bool] = mapped_column(default=False)


class Member(Base):
    __tablename__ = "album_members"
    album_id: Mapped[str] = mapped_column(ForeignKey("albums.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(16))
    __table_args__ = (CheckConstraint("role IN ('contributor','viewer')"),)


class Invite(Base):
    __tablename__ = "album_invites"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    album_id: Mapped[str] = mapped_column(ForeignKey("albums.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[str] = mapped_column(String(16))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(default=False)
    max_uses: Mapped[int] = mapped_column(default=10)
    used_count: Mapped[int] = mapped_column(default=0)
    __table_args__ = (CheckConstraint("role IN ('contributor','viewer')"),)


class Redemption(Base):
    __tablename__ = "invite_redemptions"
    invite_id: Mapped[str] = mapped_column(ForeignKey("album_invites.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)


class Memory(Base):
    __tablename__ = "memories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    album_id: Mapped[str] = mapped_column(ForeignKey("albums.id"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200))
    date: Mapped[date]
    location: Mapped[str] = mapped_column(String(300), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    animations: Mapped[dict] = mapped_column(JSON, default=dict)
    position: Mapped[int] = mapped_column(default=0)
    version: Mapped[int] = mapped_column(default=1)
    published: Mapped[bool] = mapped_column(default=False)
    deleted: Mapped[bool] = mapped_column(default=False)


class Photo(Base):
    __tablename__ = "photos"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    memory_id: Mapped[str] = mapped_column(ForeignKey("memories.id"), index=True)
    object_key: Mapped[str] = mapped_column(String(255), unique=True)
    thumbnail_key: Mapped[str] = mapped_column(String(255), unique=True)
    mime: Mapped[str] = mapped_column(String(50))
    byte_size: Mapped[int]
    width: Mapped[int]
    height: Mapped[int]
    checksum: Mapped[str] = mapped_column(String(64))
    position: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String(16), default="pending")


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    memory_id: Mapped[str] = mapped_column(ForeignKey("memories.id"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    version: Mapped[int] = mapped_column(default=1)
    edited: Mapped[bool] = mapped_column(default=False)


class Reaction(Base):
    __tablename__ = "reactions"
    memory_id: Mapped[str] = mapped_column(ForeignKey("memories.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    __table_args__ = (CheckConstraint("kind IN ('heart','like','happy','wow','sad')"),)


class StorageJob(Base):
    __tablename__ = "storage_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    object_key: Mapped[str] = mapped_column(String(255), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    attempts: Mapped[int] = mapped_column(default=0)
    done: Mapped[bool] = mapped_column(default=False)


class MigrationItem(Base):
    __tablename__ = "migration_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    source: Mapped[str] = mapped_column(String(100))
    legacy_id: Mapped[str] = mapped_column(String(200))
    input_hash: Mapped[str] = mapped_column(String(64))
    memory_id: Mapped[str] = mapped_column(ForeignKey("memories.id"))
    extras: Mapped[dict] = mapped_column(JSON, default=dict)
    __table_args__ = (UniqueConstraint("source", "legacy_id"),)
