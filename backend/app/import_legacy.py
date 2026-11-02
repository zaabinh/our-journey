"""Explicit, resumable legacy JSON importer. Reads source/media only; --apply writes DB and media."""

import argparse
import base64
import binascii
import hashlib
import json
import re
from datetime import date
from pathlib import Path

from fastapi import HTTPException
from PIL import Image
from sqlalchemy import select

from . import models as m
from .db import SessionLocal
from .services.media import decode_image, persist_photo


def image_bytes(value: str | dict, media_root: Path | None) -> bytes:
    if isinstance(value, dict) and isinstance(value.get("data"), str):
        mime, encoded = value.get("mime"), value["data"]
        if mime not in {"image/jpeg", "image/png", "image/webp"}:
            raise ValueError("unsupported image MIME type")
        try:
            return base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as error:
            raise ValueError("invalid base64 image payload") from error
    if value.startswith("data:image/"):
        header, encoded = value.split(",", 1)
        if not re.fullmatch(r"data:image/(?:jpeg|png|webp);base64", header):
            raise ValueError("unsupported data image")
        try:
            return base64.b64decode(encoded, validate=True)
        except binascii.Error as error:
            raise ValueError("invalid base64 image payload") from error
    if not media_root or "://" in value or value.startswith(("/", "\\")):
        raise ValueError("unresolved image reference")
    root = media_root.resolve()
    path = (root / value).resolve()
    if not path.is_relative_to(root) or path == root:
        raise ValueError("unsafe image path")
    return path.read_bytes()


def validate_record(record, index, mapping, media_root):
    if not isinstance(record, dict) or "id" not in record:
        raise ValueError("invalid record or missing ID")
    if re.search(
        r'"(?:password|session|access_token|refresh_token)"\s*:', json.dumps(record), re.I
    ):
        raise ValueError("sensitive auth field present")
    owner = record.get("owner", record.get("authorId"))
    old_owner = owner if isinstance(owner, str) else "__unassigned__"
    author_id = mapping.get(old_owner)
    if not author_id:
        raise ValueError("owner mapping required")
    raw_date = record.get("date")
    try:
        value = str(raw_date or "")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError
        memory_date = date.fromisoformat(value)
        date_label = None
    except ValueError:
        memory_date = None
        raw_label = record.get("dateLabel")
        date_label = str(raw_label if raw_label is not None else raw_date or "")[:200]
    title = str(record.get("title", "")).strip()
    if not title or len(title) > 200:
        raise ValueError("title missing or too long")
    refs = record.get("images", [record.get("image")] if record.get("image") else [])
    if not isinstance(refs, list) or not 1 <= len(refs) <= 10:
        raise ValueError("each record must contain 1-10 images")
    images = []
    for image in refs:
        value = (
            image
            if isinstance(image, dict) and isinstance(image.get("data"), str)
            else image.get("src")
            if isinstance(image, dict)
            else image
        )
        if not isinstance(value, (str, dict)):
            raise ValueError("invalid image reference")
        raw = image_bytes(value, media_root)
        safe, _, _, _ = decode_image(raw)
        images.append((raw, hashlib.sha256(safe).hexdigest()))
    return {
        "index": index,
        "legacy_id": str(record["id"]),
        "hash": hashlib.sha256(
            (
                json.dumps(
                    {
                        k: v
                        for k, v in record.items()
                        if k not in {"images", "image", "_source_record"}
                    },
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                + json.dumps([checksum for _, checksum in images])
            ).encode()
        ).hexdigest(),
        "record": record.get(
            "_source_record",
            {k: v for k, v in record.items() if k not in {"images", "image", "_source_record"}},
        ),
        "author_id": author_id,
        "date": memory_date,
        "date_label": date_label,
        "images": images,
    }


def normalize_source(value):
    if isinstance(value, list):
        return value
    if (
        not isinstance(value, dict)
        or value.get("version") != 1
        or not isinstance(value.get("data"), dict)
    ):
        raise ValueError("source must be a legacy record array or version-1 Our Journey export")
    data = value["data"]
    memories, photos = data.get("memories"), data.get("photos")
    if not isinstance(memories, list) or not isinstance(photos, list):
        raise ValueError("version-1 export must contain memories and photos arrays")
    photo_map = {
        str(photo.get("id")): photo
        for photo in photos
        if isinstance(photo, dict) and photo.get("id")
    }
    records = []
    for memory in memories:
        if not isinstance(memory, dict):
            records.append(memory)
            continue
        record = dict(memory)
        record["owner"] = memory.get("authorId")
        record["_source_record"] = memory
        refs = []
        for ident in memory.get("photoIds", []):
            photo = photo_map.get(str(ident))
            if not photo:
                refs.append(None)
            else:
                refs.append({"mime": photo.get("mime"), "data": photo.get("data")})
        record["images"] = refs
        records.append(record)
    return records


def run(
    source_path: Path,
    media_path: Path | None,
    source_name: str,
    album_id: str,
    mapping: dict,
    apply: bool,
):
    raw = source_path.read_bytes()
    records = normalize_source(json.loads(raw))
    if not isinstance(records, list) or len(records) > 1000:
        raise ValueError("source must be a JSON array with at most 1000 records")
    prepared, errors, seen = [], [], set()
    for index, record in enumerate(records):
        try:
            item = validate_record(record, index, mapping, media_path)
            if item["legacy_id"] in seen:
                raise ValueError("duplicate legacy ID")
            seen.add(item["legacy_id"])
            prepared.append(item)
        except (
            ValueError,
            OSError,
            json.JSONDecodeError,
            Image.DecompressionBombError,
            HTTPException,
        ) as error:
            errors.append(
                {
                    "index": index,
                    "reason": str(error)
                    if not isinstance(error, HTTPException)
                    else "invalid or oversized image",
                }
            )
    report = {
        "records": len(records),
        "ready": len(prepared),
        "errors": len(errors),
        "applied": 0,
        "resumed": 0,
        "skipped": 0,
        "source_sha256": hashlib.sha256(raw).hexdigest(),
    }
    if errors or not apply:
        report["error_details"] = errors
        return report
    with SessionLocal() as db:
        album = db.get(m.Album, album_id)
        if not album or album.deleted:
            raise ValueError("target album does not exist")
        owner_ids = {album.owner_id} | set(
            db.scalars(select(m.Member.user_id).where(m.Member.album_id == album_id)).all()
        )
        for item in prepared:
            if item["author_id"] not in owner_ids:
                raise ValueError(
                    "every owner mapping must target an active member of the chosen album"
                )
        for item in prepared:
            old = db.scalar(
                select(m.MigrationItem)
                .where(
                    m.MigrationItem.source == source_name,
                    m.MigrationItem.legacy_id == item["legacy_id"],
                )
                .with_for_update()
            )
            if old and old.input_hash != item["hash"]:
                raise ValueError(
                    f"legacy ID {item['legacy_id']} changed payload; use a new source namespace after review"
                )
            if old:
                memory = db.get(m.Memory, old.memory_id)
                report["resumed"] += 1
            else:
                record = item["record"]
                pos = record.get("order", item["index"])
                if not isinstance(pos, (int, float)) or not float(pos).is_integer():
                    pos = item["index"]
                memory = m.Memory(
                    album_id=album_id,
                    author_id=item["author_id"],
                    title=str(record["title"]).strip(),
                    date=item["date"],
                    date_label=item["date_label"],
                    location=str(record.get("location") or "")[:300],
                    note=str(record.get("note") or "")[:20000],
                    animations=record.get("animations") or {},
                    position=int(pos),
                    published=False,
                )
                db.add(memory)
                db.flush()
                old = m.MigrationItem(
                    source=source_name,
                    legacy_id=item["legacy_id"],
                    input_hash=item["hash"],
                    memory_id=memory.id,
                    extras={"record": item["record"]},
                )
                db.add(old)
                db.commit()
                report["applied"] += 1
            if memory.album_id != album_id:
                raise ValueError("checkpoint points to a different target album")
            for index, (photo_raw, checksum) in enumerate(item["images"]):
                existing = db.scalar(
                    select(m.Photo).where(
                        m.Photo.memory_id == memory.id,
                        m.Photo.checksum == checksum,
                        m.Photo.status == "ready",
                    )
                )
                if not existing:
                    persist_photo(db, photo_raw, memory_id=memory.id, position=index)
            memory.published = True
            if album.cover_photo_id is None:
                first_photo = db.scalar(
                    select(m.Photo)
                    .where(m.Photo.memory_id == memory.id, m.Photo.status == "ready")
                    .order_by(m.Photo.position)
                )
                if first_photo:
                    album.cover_photo_id = first_photo.id
            db.commit()
    report["error_details"] = []
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--media-root", type=Path)
    parser.add_argument(
        "--source-name", required=True, help="Stable namespace; reuse exactly to resume"
    )
    parser.add_argument("--album-id", required=True)
    parser.add_argument(
        "--owner-map",
        type=Path,
        required=True,
        help="JSON mapping legacy owner labels to Our Journey user IDs",
    )
    parser.add_argument(
        "--apply", action="store_true", help="Write to configured database and storage"
    )
    args = parser.parse_args()
    mapping = json.loads(args.owner_map.read_text(encoding="utf-8"))
    if not isinstance(mapping, dict) or any(
        not isinstance(k, str) or not isinstance(v, str) for k, v in mapping.items()
    ):
        parser.error("owner map must be a JSON object of strings")
    result = run(args.source, args.media_root, args.source_name, args.album_id, mapping, args.apply)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 2 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
