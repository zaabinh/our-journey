import base64
import hashlib
import secrets
from datetime import timedelta
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session as DB

from .. import models as m
from .. import schemas as s
from ..config import settings
from ..db import get_db
from ..errors import fail
from ..policies import album_access, memory_access, nonblank, version_check
from ..security import (
    COOKIE,
    DUMMY_HASH,
    authenticated,
    check_origin,
    digest,
    limit_auth,
    passwords,
)
from ..storage import LocalStorage, storage

__all__ = [
    "base64",
    "hashlib",
    "secrets",
    "timedelta",
    "BytesIO",
    "Annotated",
    "APIRouter",
    "Depends",
    "File",
    "Query",
    "Request",
    "Response",
    "UploadFile",
    "Image",
    "ImageOps",
    "UnidentifiedImageError",
    "delete",
    "func",
    "or_",
    "select",
    "DB",
    "m",
    "s",
    "settings",
    "get_db",
    "fail",
    "album_access",
    "memory_access",
    "nonblank",
    "version_check",
    "COOKIE",
    "DUMMY_HASH",
    "authenticated",
    "check_origin",
    "digest",
    "limit_auth",
    "passwords",
    "LocalStorage",
    "storage",
    "Db",
    "Auth",
    "public_user",
    "album_json",
    "memory_json",
    "page",
    "queue_photo_delete",
]

Db = Annotated[DB, Depends(get_db)]
Auth = Annotated[m.User, Depends(authenticated)]


def public_user(user):
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_photo_id": user.avatar_photo_id,
    }


def album_json(a, role=None):
    return {
        "id": a.id,
        "owner_id": a.owner_id,
        "title": a.title,
        "description": a.description,
        "cover_photo_id": a.cover_photo_id,
        "version": a.version,
        "role": role,
    }


def memory_json(a):
    return {
        k: getattr(a, k)
        for k in (
            "id",
            "album_id",
            "author_id",
            "title",
            "date",
            "date_label",
            "location",
            "note",
            "animations",
            "position",
            "version",
            "published",
        )
    }


def page(query, db, id_column, cursor, limit):
    if cursor:
        query = query.where(id_column > cursor)
    items = db.scalars(query.order_by(id_column).limit(limit + 1)).all()
    return items[:limit], items[limit - 1].id if len(items) > limit else None


def queue_photo_delete(db, photo):
    from sqlalchemy.dialects.postgresql import insert

    photo.status = "deleting"
    for key in (photo.object_key, photo.thumbnail_key):
        db.execute(
            insert(m.StorageJob)
            .values(id=m.uid(), object_key=key, created_at=m.now(), attempts=0, done=False)
            .on_conflict_do_update(index_elements=["object_key"], set_={"done": False})
        )
