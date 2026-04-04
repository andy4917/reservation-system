from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        capture_dir = temp_root / "capture"
        capture_dir.mkdir(parents=True, exist_ok=True)
        (capture_dir / "manifest.json").write_text(json.dumps({"bundle_id": "bundle-1"}, ensure_ascii=False), encoding="utf-8")
        (capture_dir / "sheet_rows.json").write_text(
            json.dumps(
                [
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
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        (capture_dir / "wings_reservations.json").write_text(
            json.dumps(
                [
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
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        (capture_dir / "ota_inventory_rows.json").write_text(
            json.dumps(
                [
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
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        (capture_dir / "ota_reservations.json").write_text(
            json.dumps(
                [
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
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        (capture_dir / "bridge_events.json").write_text(
            json.dumps(
                [
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
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        spec_path = temp_root / "capture_spec.json"
        spec_path.write_text(
            json.dumps(
                {
                    "contract_version": "canonical-data-contract-v1",
                    "manifest_path": str(capture_dir / "manifest.json"),
                    "entity_paths": {
                        "sheet_rows": str(capture_dir / "sheet_rows.json"),
                        "wings_reservations": str(capture_dir / "wings_reservations.json"),
                        "ota_inventory_rows": str(capture_dir / "ota_inventory_rows.json"),
                        "ota_reservations": str(capture_dir / "ota_reservations.json"),
                        "bridge_events": str(capture_dir / "bridge_events.json"),
                    },
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        output_path = Path(temp_dir) / "bundle.json"
        command = [
            sys.executable,
            str(ROOT / "scripts" / "build_truth_capture_bundle.py"),
            "--spec",
            str(spec_path),
            "--output",
            str(output_path),
        ]
        completed = subprocess.run(command, cwd=ROOT, check=True, capture_output=True, text=True)
        result = json.loads(completed.stdout)
        assert result["ok"] is True
        assert output_path.exists()

        built = json.loads(output_path.read_text(encoding="utf-8"))
        assert built["contract_version"] == "canonical-data-contract-v1"
        assert built["manifest"]["bundle_id"] == "bundle-1"
        assert built["entities"]["sheet_rows"][0]["canonical_room_id"] == "BRANCH_THE_SEOLLEUNG-B-1001"
        assert built["entities"]["wings_reservations"][0]["canonical_reservation_id"] == "CID-1"
        assert built["entities"]["ota_inventory_rows"][0]["item_id"] == "ITEM-1"
        assert built["entities"]["ota_reservations"][0]["reservation_id"] == "OTA-1"
        assert built["entities"]["bridge_events"][0]["provider"] == "naver"

    print("regression_truth_capture_builder_py: OK")


if __name__ == "__main__":
    main()
