"""Image validation and durable storage lifecycle shared by memory and profile photos."""

from hashlib import sha256
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError
from .. import models as m
from ..config import settings
from ..errors import fail
from ..storage import storage


def decode_image(raw: bytes):
    try:
        with Image.open(BytesIO(raw)) as original:
            if original.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("Unsupported format")
            if original.width * original.height > settings().max_image_pixels:
                raise ValueError("Image dimensions exceed the limit")
            original.load()
            image = ImageOps.exif_transpose(original).convert("RGB")
            width, height = image.size
            output = BytesIO()
            image.save(output, "JPEG", quality=92)
            safe = output.getvalue()
            image.thumbnail((640, 640))
            thumb = BytesIO()
            image.save(thumb, "JPEG", quality=80)
            return safe, thumb.getvalue(), width, height
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
        fail(422, "INVALID_IMAGE", "Use a valid JPEG, PNG or WebP image within pixel limits")


def persist_photo(
    db,
    raw: bytes,
    *,
    memory_id: str | None = None,
    owner_id: str | None = None,
    position: int = 0,
    before_ready=None,
):
    if len(raw) > settings().max_upload_bytes:
        fail(413, "FILE_TOO_LARGE", "Photo exceeds the configured upload limit")
    safe, thumb, width, height = decode_image(raw)
    ident = m.uid()
    photo = m.Photo(
        id=ident,
        memory_id=memory_id,
        owner_id=owner_id,
        object_key=f"photos/{ident}.jpg",
        thumbnail_key=f"thumbnails/{ident}.jpg",
        mime="image/jpeg",
        byte_size=len(safe),
        width=width,
        height=height,
        checksum=sha256(safe).hexdigest(),
        position=position,
    )
    jobs = [m.StorageJob(object_key=photo.object_key), m.StorageJob(object_key=photo.thumbnail_key)]
    db.add(photo)
    db.add_all(jobs)
    db.commit()
    try:
        store = storage()
        store.put(photo.object_key, safe, "image/jpeg")
        store.put(photo.thumbnail_key, thumb, "image/jpeg")
        if before_ready:
            before_ready()
        photo.status = "ready"
        for job in jobs:
            db.delete(job)
        db.commit()
    except Exception:
        db.rollback()
        failed = db.get(m.Photo, ident)
        if failed:
            failed.status = "failed"
            db.commit()
        fail(503, "UPLOAD_FAILED", "Upload could not complete; please retry")
    return photo


def remove_old_avatar(db, user, new_photo):
    old_id = user.avatar_photo_id
    user.avatar_photo_id = new_photo.id
    if old_id and old_id != new_photo.id:
        old = db.get(m.Photo, old_id)
        if old and old.status == "ready":
            from ..api.common import queue_photo_delete

            queue_photo_delete(db, old)
