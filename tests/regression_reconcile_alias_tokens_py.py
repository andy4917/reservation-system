from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.domain.sheet_domain import ReservationBlock, SourceReservation
from src.reconcile.sheet_reconcile import cross_validate_sheet_vs_sources


def main() -> None:
    sheet_block = ReservationBlock(
        row=0,
        room_type="Urban Spa Suite 6in",
        room_no="1001",
        start_col=0,
        end_col=0,
        checkin=dt.date(2026, 3, 6),
        checkout=dt.date(2026, 3, 7),
        nights=1,
        price=100000,
        note="",
        reservation_no="260122143405604",
        reservation_key="260122143405604",
        branch="GANGNAM",
        channel="DIDA_TRAVEL",
        platform="DIDA_TRAVEL",
    )
    pms_source = SourceReservation(
        source_system="PMS",
        reservation_no="26179949",
        channel="DIDA_TRAVEL",
        checkin=dt.date(2026, 3, 6),
        checkout=dt.date(2026, 3, 7),
        nights=1,
        room_no="1001",
        price=100000,
        status="RR",
        status_bucket="ACTIVE",
        branch="GANGNAM",
        reservation_ref="DEB260122143405604-1623669",
    )

    issues = cross_validate_sheet_vs_sources([sheet_block], [pms_source])
    issue_types = {row.get("type") for row in issues}
    assert "MISSING_ACTIVE_IN_PMS" not in issue_types
    assert "MISSING_ACTIVE_IN_SHEET" not in issue_types
    assert "DATE_MISMATCH" not in issue_types

    print("regression_reconcile_alias_tokens_py: OK")


if __name__ == "__main__":
    main()
