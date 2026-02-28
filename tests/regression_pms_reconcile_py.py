from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_audit import parse_source_row
from src.domain.sheet_domain import ReservationBlock
from src.reconcile.sheet_reconcile import cross_validate_sheet_vs_sources


def build_block(
    reservation_no: str,
    room_no: str,
    platform: str,
    checkin: dt.date,
    checkout: dt.date,
    nights: int,
    price: int,
) -> ReservationBlock:
    return ReservationBlock(
        row=0,
        room_type="Urban Spa Suite 6in",
        room_no=room_no,
        start_col=0,
        end_col=0,
        checkin=checkin,
        checkout=checkout,
        nights=nights,
        price=price,
        note="",
        reservation_no=reservation_no,
        reservation_key=reservation_no,
        branch="COEX",
        channel=platform,
        platform=platform,
    )


def main() -> None:
    pms_row = {
        "RSVN_NO": "25150007",
        "GLOBAL_RSVN_NO": "1539358979797476",
        "ARRV_DATE": "20251008",
        "DEPT_DATE": "20251013",
        "NIGHTS": "5",
        "ROOM_NO": "0802,0902,1002",
        "ACCOUNT": "트립닷컴-코엑스",
        "SOURCE_CODE": "CMS",
        "ROOM_AMT": "5483520",
        "RSVN_STATUS_CODE": "RR",
        "PROPERTY_NO": "13",
    }
    src = parse_source_row(pms_row, source_system="PMS", default_channel="")
    assert src is not None
    assert src.reservation_no == "25150007"
    assert src.channel == "TRIP"
    assert src.branch == "COEX"
    assert src.room_no == "802,902,1002"
    assert src.status == "RR"
    assert src.status_bucket == "ACTIVE"
    assert src.audit_anomaly is False
    assert src.reservation_ref == "1539358979797476"

    block = build_block(
        reservation_no="25150007",
        room_no="2201",
        platform="AGODA",
        checkin=dt.date(2025, 10, 8),
        checkout=dt.date(2025, 10, 12),
        nights=4,
        price=1234,
    )

    issues = cross_validate_sheet_vs_sources([block], [src])
    issue_types = {x.get("type") for x in issues}
    assert "OTA_MISMATCH" in issue_types
    assert "ROOM_MISMATCH" in issue_types
    assert "DATE_MISMATCH" in issue_types
    assert "NIGHTS_MISMATCH" in issue_types
    assert "PRICE_MISMATCH_SOURCE" in issue_types

    noshow_row = {
        "RSVN_NO": "25160001",
        "ARRV_DATE": "20251008",
        "DEPT_DATE": "20251010",
        "ROOM_NO": "0802",
        "ACCOUNT": "아고다-코엑스",
        "SOURCE_CODE": "AGODA",
        "RSVN_STATUS_CODE": "NS",
    }
    anomaly_src = parse_source_row(noshow_row, source_system="PMS", default_channel="")
    assert anomaly_src is not None
    assert anomaly_src.status in {"NOSHOW", "NS"}
    assert anomaly_src.status_bucket == "ACTIVE"
    assert anomaly_src.audit_anomaly is True

    print("regression_pms_reconcile_py: OK")


if __name__ == "__main__":
    main()
