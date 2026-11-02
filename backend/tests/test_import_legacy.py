import base64

import pytest

from app.import_legacy import normalize_source, validate_record
from test_api import image_bytes


def test_version_one_export_maps_related_base64_photos_and_legacy_dates():
    payload = base64.b64encode(image_bytes()).decode("ascii")
    source = {
        "version": 1,
        "data": {
            "memories": [
                {
                    "id": "old-memory",
                    "authorId": "old-user",
                    "title": "Fixture memory",
                    "date": "",
                    "dateLabel": "Legacy date label",
                    "location": "",
                    "note": "Fixture only",
                    "animations": {},
                    "photoIds": ["old-photo"],
                    "order": 3,
                }
            ],
            "photos": [{"id": "old-photo", "mime": "image/png", "data": payload}],
        },
    }

    records = normalize_source(source)
    item = validate_record(records[0], 0, {"old-user": "target-user"}, None)

    assert item["author_id"] == "target-user"
    assert item["date"] is None
    assert item["date_label"] == "Legacy date label"
    assert item["record"]["photoIds"] == ["old-photo"]
    assert "images" not in item["record"]
    assert len(item["images"]) == 1


def test_legacy_record_array_keeps_iso_date_and_checks_photo_payload():
    image = "data:" + "image/png;base64," + base64.b64encode(image_bytes()).decode("ascii")
    record = {
        "id": "legacy-memory",
        "owner": "old-user",
        "title": "Fixture memory",
        "date": "2020-02-29",
        "images": [image],
    }
    first = validate_record(record, 0, {"old-user": "target-user"}, None)
    changed = dict(record, note="changed")
    changed_item = validate_record(changed, 0, {"old-user": "target-user"}, None)

    assert first["date"].isoformat() == "2020-02-29"
    assert first["date_label"] is None
    assert first["hash"] != changed_item["hash"]
    with pytest.raises(ValueError):
        validate_record(
            dict(record, images=["data:" + "image/png;base64,!!!!"]),
            0,
            {"old-user": "target-user"},
            None,
        )
