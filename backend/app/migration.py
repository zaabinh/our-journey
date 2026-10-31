"""Read-only inventory. No network access and no database mutation.

python -m app.migration /absolute/private/export.json --media-root /absolute/private/assets
Exit 2 means unresolved/invalid input; reports contain counts only.
"""

import argparse
import base64
import hashlib
import json
from pathlib import Path
from io import BytesIO
from PIL import Image


def inventory(path, media_root=None):
    source = Path(path).read_bytes()
    data = json.loads(source)
    if not isinstance(data, list):
        raise ValueError("Legacy export must be a JSON array")
    ids, checksums = set(), set()
    report = {
        "records": len(data),
        "images": 0,
        "duplicate_ids": 0,
        "duplicate_images": 0,
        "invalid_images": 0,
        "missing_files": 0,
        "unmapped_owners": 0,
        "source_sha256": hashlib.sha256(source).hexdigest(),
    }
    root = Path(media_root).resolve() if media_root else None
    for item in data:
        if not isinstance(item, dict):
            raise ValueError("Invalid record")
        ident = str(item.get("id", ""))
        if not ident or ident in ids:
            report["duplicate_ids"] += 1
        ids.add(ident)
        if not item.get("owner"):
            report["unmapped_owners"] += 1
        images = item.get("images", [])
        if not isinstance(images, list):
            raise ValueError("Invalid images list")
        for image in images:
            report["images"] += 1
            value = image.get("src") if isinstance(image, dict) else image
            try:
                if not isinstance(value, str):
                    raise ValueError("Invalid image reference")
                if value.startswith("data:image/"):
                    header, encoded = value.split(",", 1)
                    if not header.endswith(";base64"):
                        raise ValueError("Only base64 data URLs are supported")
                    raw = base64.b64decode(encoded, validate=True)
                else:
                    if not root or "://" in value or value.startswith("/"):
                        raise FileNotFoundError("Unresolved image reference")
                    file = (root / value).resolve()
                    if not file.is_relative_to(root):
                        raise ValueError("Unsafe image path")
                    raw = file.read_bytes()
                with Image.open(BytesIO(raw)) as decoded:
                    decoded.verify()
                checksum = hashlib.sha256(raw).hexdigest()
                if checksum in checksums:
                    report["duplicate_images"] += 1
                checksums.add(checksum)
            except FileNotFoundError:
                report["missing_files"] += 1
            except (ValueError, OSError):
                report["invalid_images"] += 1
    report["ready_for_owner_mapping"] = not any(
        report[k] for k in ("duplicate_ids", "invalid_images", "missing_files")
    )
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("--media-root")
    args = parser.parse_args()
    report = inventory(args.source, args.media_root)
    print(json.dumps(report, indent=2))
    return 0 if report["ready_for_owner_mapping"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
