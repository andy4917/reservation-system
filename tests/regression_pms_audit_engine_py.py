from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_sync import build_pms_har_source_summary  # noqa: E402
from src.domain.audit_engine import build_ota_pms_anomaly_report  # noqa: E402


def build_har_payload() -> dict:
    rows = [
        {
            "RSVN_NO": "B-1001",
            "ARRV_DATE": "20260301",
            "DEPT_DATE": "20260303",
            "NIGHTS": "2",
            "SOURCE_CODE": "BOOKING",
            "RSVN_STATUS_CODE": "RR",
        },
        {
            "RSVN_NO": "B-1002",
            "ARRV_DATE": "20260302",
            "DEPT_DATE": "20260304",
            "NIGHTS": "2",
            "SOURCE_CODE": "BOOKING",
            "RSVN_STATUS_CODE": "RR",
        },
        {
            "RSVN_NO": "B-1003",
            "ARRV_DATE": "20260303",
            "DEPT_DATE": "20260305",
            "NIGHTS": "2",
            "SOURCE_CODE": "BOOKING",
            "RSVN_STATUS_CODE": "CXL",
        },
        {
            "RSVN_NO": "A-2001",
            "ARRV_DATE": "20260303",
            "DEPT_DATE": "20260305",
            "NIGHTS": "2",
            "SOURCE_CODE": "AGODA",
            "RSVN_STATUS_CODE": "RR",
        },
    ]
    payload = {"data": {"rows": rows}}
    return {
        "log": {
            "entries": [
                {
                    "request": {"postData": {"text": json.dumps(payload, ensure_ascii=False)}},
                    "response": {"content": {"text": ""}},
                }
            ]
        }
    }


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        har_path = Path(tmp) / "wings_pms.har"
        har_path.write_text(json.dumps(build_har_payload(), ensure_ascii=False), encoding="utf-8")
        pms_summary = build_pms_har_source_summary(
            har_paths=[str(har_path)],
            range_start="2026-03-01",
            range_end="2026-03-31",
        )

    assert pms_summary["enabled"] is True
    assert pms_summary["issues"] == []
    assert pms_summary["providers"]["BOOKING"]["reservation_count"] == 3
    assert pms_summary["providers"]["BOOKING"]["active_count"] == 2
    assert pms_summary["providers"]["BOOKING"]["canceled_count"] == 1

    ota_summary = {
        "enabled": True,
        "providers": {
            "BOOKING": {"reservation_count": 3, "canceled_count": 0},
            "AGODA": {"reservation_count": 1, "canceled_count": 0},
        },
    }
    report = build_ota_pms_anomaly_report(ota_sources=ota_summary, pms_sources=pms_summary)
    assert report["enabled"] is True
    assert report["counts"]["providers"] == 2
    assert report["counts"]["mismatches"] == 1
    assert report["counts"]["anomalies"] == 1
    assert report["counts"]["warn"] == 1
    assert report["counts"]["error"] == 0
    assert report["anomalies"][0]["provider"] == "BOOKING"
    assert report["anomalies"][0]["severity"] == "warn"

    disabled_report = build_ota_pms_anomaly_report(
        ota_sources={"enabled": False, "providers": {}},
        pms_sources=pms_summary,
    )
    assert disabled_report["enabled"] is False
    assert disabled_report["counts"]["anomalies"] == 0

    print("regression_pms_audit_engine_py: OK")


if __name__ == "__main__":
    main()
