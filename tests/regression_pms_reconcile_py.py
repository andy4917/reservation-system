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
        "NATIONALITY": "중국",
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
    assert src.nationality_nights == "중국 5박"

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

    duplicate_pms_row = {
        "RSVN_NO": "26010001",
        "ARRV_DATE": "20260110",
        "DEPT_DATE": "20260112",
        "ROOM_NO": "0802",
        "ACCOUNT": "아고다-코엑스",
        "SOURCE_CODE": "AGODA",
        "RSVN_STATUS_CODE": "RR",
    }
    duplicate_src = parse_source_row(duplicate_pms_row, source_system="PMS", default_channel="")
    assert duplicate_src is not None
    duplicate_sheet_blocks = [
        build_block(
            reservation_no="26010001",
            room_no="802",
            platform="AGODA",
            checkin=dt.date(2026, 1, 10),
            checkout=dt.date(2026, 1, 12),
            nights=2,
            price=200000,
        ),
        build_block(
            reservation_no="26010001",
            room_no="902",
            platform="AGODA",
            checkin=dt.date(2026, 1, 10),
            checkout=dt.date(2026, 1, 12),
            nights=2,
            price=200000,
        ),
    ]
    duplicate_issues = cross_validate_sheet_vs_sources(duplicate_sheet_blocks, [duplicate_src])
    duplicate_issue_types = {x.get("type") for x in duplicate_issues}
    assert "PMS_DUPLICATE_SHEET_ROOMS_SUSPECT" in duplicate_issue_types

    multi_room_pms_row = {
        "RSVN_NO": "26010002",
        "ARRV_DATE": "20260110",
        "DEPT_DATE": "20260112",
        "ROOM_NO": "0802,0902",
        "ACCOUNT": "아고다-코엑스",
        "SOURCE_CODE": "AGODA",
        "RSVN_STATUS_CODE": "RR",
    }
    multi_room_src = parse_source_row(multi_room_pms_row, source_system="PMS", default_channel="")
    assert multi_room_src is not None
    multi_room_sheet_blocks = [
        build_block(
            reservation_no="26010002",
            room_no="802",
            platform="AGODA",
            checkin=dt.date(2026, 1, 10),
            checkout=dt.date(2026, 1, 12),
            nights=2,
            price=200000,
        ),
        build_block(
            reservation_no="26010002",
            room_no="902",
            platform="AGODA",
            checkin=dt.date(2026, 1, 10),
            checkout=dt.date(2026, 1, 12),
            nights=2,
            price=200000,
        ),
    ]
    multi_room_issues = cross_validate_sheet_vs_sources(multi_room_sheet_blocks, [multi_room_src])
    multi_room_issue_types = {x.get("type") for x in multi_room_issues}
    assert "PMS_DUPLICATE_SHEET_ROOMS_SUSPECT" not in multi_room_issue_types

    missing_room_pms_row = {
        "RSVN_NO": "26010003",
        "ARRV_DATE": "20260110",
        "DEPT_DATE": "20260112",
        "ROOM_NO": "0802,0902",
        "ACCOUNT": "아고다-코엑스",
        "SOURCE_CODE": "AGODA",
        "RSVN_STATUS_CODE": "RR",
    }
    missing_room_src = parse_source_row(missing_room_pms_row, source_system="PMS", default_channel="")
    assert missing_room_src is not None
    missing_room_sheet_blocks = [
        build_block(
            reservation_no="26010003",
            room_no="802",
            platform="AGODA",
            checkin=dt.date(2026, 1, 10),
            checkout=dt.date(2026, 1, 12),
            nights=2,
            price=200000,
        ),
    ]
    missing_room_issues = cross_validate_sheet_vs_sources(missing_room_sheet_blocks, [missing_room_src])
    missing_room_issue_types = {x.get("type") for x in missing_room_issues}
    assert "PMS_MISSING_SHEET_ROOMS_SUSPECT" in missing_room_issue_types

    mixed_channel_pms_row = {
        "RSVN_NO": "26010004",
        "ARRV_DATE": "20260110",
        "DEPT_DATE": "20260112",
        "ROOM_NO": "0802",
        "ACCOUNT": "아고다-코엑스",
        "SOURCE_CODE": "AGODA",
        "RSVN_STATUS_CODE": "RR",
    }
    mixed_channel_src = parse_source_row(mixed_channel_pms_row, source_system="PMS", default_channel="")
    assert mixed_channel_src is not None
    mixed_channel_sheet_blocks = [
        build_block(
            reservation_no="26010004",
            room_no="802",
            platform="AGODA",
            checkin=dt.date(2026, 1, 10),
            checkout=dt.date(2026, 1, 12),
            nights=2,
            price=200000,
        ),
        build_block(
            reservation_no="26010004",
            room_no="802",
            platform="BOOKING",
            checkin=dt.date(2026, 1, 10),
            checkout=dt.date(2026, 1, 12),
            nights=2,
            price=200000,
        ),
    ]
    mixed_channel_issues = cross_validate_sheet_vs_sources(mixed_channel_sheet_blocks, [mixed_channel_src])
    mixed_channel_issue_types = {x.get("type") for x in mixed_channel_issues}
    assert "PMS_MULTI_CHANNEL_SHEET_SUSPECT" in mixed_channel_issue_types
    assert "PMS_DUPLICATE_SHEET_STAY_SUSPECT" in mixed_channel_issue_types

    print("regression_pms_reconcile_py: OK")


if __name__ == "__main__":
    main()
