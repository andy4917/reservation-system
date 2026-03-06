from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.domain.sheet_domain import ReservationBlock, SourceReservation
from src.reconcile.sheet_reconcile import cross_validate_sheet_vs_sources
from src.scan.sheet_scan import parse_reservation_identity


def main() -> None:
    note_alpha = (
        "예약번호 : HMX5YZ3R8K 예약자 : TEST "
        "연락처 : 818043935013 투숙 기간 : 2026-03-09 - 2026-03-12"
    )
    parsed_alpha = parse_reservation_identity(note_alpha)
    assert parsed_alpha.get("reservation_no") == "HMX5YZ3R8K"

    note_short = (
        "예약번호 : 6224 예약자 : TEST "
        "연락처 : +1 2135454508 투숙 기간 : 2026-03-08 - 2026-03-10"
    )
    parsed_short = parse_reservation_identity(note_short)
    assert parsed_short.get("reservation_no") == "6224"

    sheet_block = ReservationBlock(
        row=0,
        room_type="Urban Spa Suite 6in",
        room_no="601",
        start_col=0,
        end_col=0,
        checkin=dt.date(2026, 3, 8),
        checkout=dt.date(2026, 3, 10),
        nights=2,
        price=1215000,
        note=note_short,
        reservation_no="6224",
        reservation_key="6224",
        branch="GANGNAM",
        channel="STATION",
        platform="STATION",
    )
    source = SourceReservation(
        source_system="PMS",
        reservation_no="26176917",
        channel="STATION",
        checkin=dt.date(2026, 3, 8),
        checkout=dt.date(2026, 3, 10),
        nights=2,
        room_no="601",
        price=1215000,
        account="스테이션",
        status="RR",
        status_bucket="ACTIVE",
        branch="GANGNAM",
        reservation_ref="6224",
    )
    issues = cross_validate_sheet_vs_sources([sheet_block], [source])
    issue_types = {row.get("type") for row in issues}
    assert "MISSING_ACTIVE_IN_SHEET" not in issue_types
    assert "MISSING_ACTIVE_IN_PMS" not in issue_types
    assert "DATE_MISMATCH" not in issue_types

    print("regression_note_reservation_id_extraction_py: OK")


if __name__ == "__main__":
    main()
