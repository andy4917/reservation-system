from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_sync import build_ota_har_source_summary  # noqa: E402


def build_har_payload() -> dict:
    rows = [
        {
            "RSVN_NO": "B-1001",
            "ARRV_DATE": "20260301",
            "DEPT_DATE": "20260303",
            "NIGHTS": "2",
            "SOURCE_CODE": "BOOKING",
            "RSVN_STATUS_CODE": "RR",
            "item_id": "BOOKING-ROOM-1",
            "date": "2026-03-01",
            "stock": 2,
        },
        {
            "RSVN_NO": "A-2001",
            "ARRV_DATE": "20260302",
            "DEPT_DATE": "20260304",
            "NIGHTS": "2",
            "SOURCE_CODE": "AGODA",
            "RSVN_STATUS_CODE": "CN",
            "item_id": "AGODA-ROOM-1",
            "date": "2026-03-02",
            "availability": 3,
        },
        {
            "RSVN_NO": "T-3001",
            "ARRV_DATE": "20260303",
            "DEPT_DATE": "20260305",
            "NIGHTS": "2",
            "SOURCE_CODE": "TRIP",
            "RSVN_STATUS_CODE": "RR",
            "item_id": "TRIP-ROOM-1",
            "date": "2026-03-03",
            "availableStock": 1,
        },
        {
            "confirmation_code": "ABNB-4001",
            "check_in": "2026-03-04",
            "check_out": "2026-03-06",
            "nights": 2,
            "channel": "AIRBNB",
            "status": "confirmed",
            "listing_id": "AIRBNB-ROOM-1",
            "day": "2026-03-04",
            "stock": 1,
        },
    ]
    payload = {"data": {"rows": rows}}
    return {
        "log": {
            "entries": [
                {
                    "request": {"postData": {"text": json.dumps(payload, ensure_ascii=False)}},
                    "response": {"content": {"text": json.dumps(payload, ensure_ascii=False)}},
                }
            ]
        }
    }


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        har_path = Path(tmp) / "wings_source.har"
        har_path.write_text(json.dumps(build_har_payload(), ensure_ascii=False), encoding="utf-8")
        with requests.Session() as session:
            summary = build_ota_har_source_summary(
                session=session,
                har_paths=[str(har_path)],
                range_start="2026-03-01",
                range_end="2026-03-31",
            )
    assert summary["enabled"] is True
    assert len(summary["providers"]) == 4
    assert summary["issues"] == []
    assert summary["providers"]["BOOKING"]["reservation_count"] == 1
    assert summary["providers"]["AGODA"]["canceled_count"] == 1
    assert summary["providers"]["TRIP"]["inventory_count"] == 1
    assert summary["providers"]["AIRBNB"]["change_count"] >= 1
    print("regression_sync_ota_source_summary_py: OK")


if __name__ == "__main__":
    main()
