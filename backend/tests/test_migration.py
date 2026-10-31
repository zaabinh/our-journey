import base64
import json
from app.migration import inventory
from test_api import image_bytes


def test_inventory_is_non_destructive_and_detects_duplicates(tmp_path):
    data = "data:image/png;base64," + base64.b64encode(image_bytes()).decode()
    source = tmp_path / "source.json"
    source.write_text(
        json.dumps(
            [
                {"id": "one", "images": [data]},
                {"id": "two", "images": [data, "missing.png"]},
            ]
        )
    )
    before = source.read_bytes()
    report = inventory(source, tmp_path)
    assert report["records"] == 2
    assert report["duplicate_images"] == 1
    assert report["missing_files"] == 1
    assert not report["ready_for_owner_mapping"]
    assert source.read_bytes() == before


def test_inventory_never_follows_network_or_unsafe_paths(tmp_path):
    source = tmp_path / "source.json"
    source.write_text(
        json.dumps(
            [
                {
                    "id": "one",
                    "images": [
                        "https://example.test/private.png",
                        "../secret.png",
                        "data:image/png;base64,!!!!",
                    ],
                }
            ]
        )
    )
    report = inventory(source, tmp_path)
    assert report["missing_files"] == 1
    assert report["invalid_images"] == 2
