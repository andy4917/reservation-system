from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.validate_truth_dataset import load_json, validate_bundle


def main() -> None:
    room_alias_graph = load_json(ROOT / "truth_dataset" / "room_alias_graph_v1.json")
    with tempfile.TemporaryDirectory() as temp_dir:
        bundle_path = Path(temp_dir) / "bundle.json"
        bundle_path.write_text(
            json.dumps(
                {
                    "contract_version": "canonical-data-contract-v1",
                    "manifest": {"bundle_id": "bundle-1"},
                    "entities": {
                        "sheet_rows": [
                            {
                                "branch": "BRANCH_THE_SEOLLEUNG",
                                "room_row": 1,
                                "inventory_row": 1,
                                "date": "2026-04-04",
                                "raw_channel": "NAVER",
                                "canonical_channel": "NAVER",
                                "room_aliases": ["1001"],
                                "canonical_room_id": "BRANCH_THE_SEOLLEUNG-B-1001",
                            }
                        ],
                        "wings_reservations": [
                            {
                                "branch": "BRANCH_THE_SEOLLEUNG",
                                "reservation_no": "RSV-1",
                                "room_no": "1001",
                                "status": "RR",
                                "status_bucket": "ACTIVE",
                                "raw_channel": "NAVER",
                                "canonical_channel": "NAVER",
                                "updated_at": "2026-04-04T00:00:00",
                                "canonical_reservation_id": "CID-1",
                                "canonical_room_id": "BRANCH_THE_SEOLLEUNG-B-1001",
                            }
                        ],
                        "ota_inventory_rows": [
                            {
                                "provider": "naver",
                                "branch": "BRANCH_THE_SEOLLEUNG",
                                "item_id": "ITEM-1",
                                "date": "2026-04-04",
                                "stock": 1,
                                "raw_room_label": "1001",
                                "raw_channel": "NAVER",
                                "canonical_channel": "NAVER",
                            }
                        ],
                        "ota_reservations": [
                            {
                                "provider": "naver",
                                "branch": "BRANCH_THE_SEOLLEUNG",
                                "reservation_id": "OTA-1",
                                "raw_status": "CONFIRMED",
                                "raw_room_label": "1001",
                                "raw_channel": "NAVER",
                                "canonical_channel": "NAVER",
                                "canonical_reservation_id": "CID-1",
                            }
                        ],
                        "bridge_events": [
                            {
                                "provider": "naver",
                                "branch": "BRANCH_THE_SEOLLEUNG",
                                "rawLine": "line",
                                "sourceLineIndex": 1,
                                "candidateBasis": "basis",
                                "signals": ["signal"],
                                "tags": ["tag"],
                            }
                        ],
                    },
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        bundle = load_json(bundle_path)
    result = validate_bundle(bundle, room_alias_graph)

    assert result["ok"] is True
    assert result["failures"] == []
    assert result["metrics"]["join_coverage"]["reservation_joined"] == 1
    assert result["metrics"]["join_coverage"]["room_joined"] == 1
    assert result["metrics"]["channel_accuracy"]["mapped"] == 3
    assert result["metrics"]["room_alias_unresolved"]["unresolved"] == 0
    assert result["metrics"]["identity_collision"]["collisions"] == 0
    assert result["metrics"]["branch_missing_rate"]["BRANCH_THE_SEOLLEUNG"]["missing"] == 0

    print("regression_truth_dataset_validator_py: OK")


if __name__ == "__main__":
    main()
