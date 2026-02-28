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
    block = ReservationBlock(
        row=0,
        room_type="Urban Spa Suite 6in",
        room_no="701",
        start_col=0,
        end_col=0,
        checkin=dt.date(2026, 3, 4),
        checkout=dt.date(2026, 3, 5),
        nights=1,
        price=100000,
        note="수기 스테이션 예약",
        reservation_no="MANUAL-701",
        reservation_key="MANUAL-701",
        branch="COEX",
        channel="STATION",
        platform="STATION",
    )
    active_source = SourceReservation(
        source_system="PMS",
        reservation_no="25170999",
        channel="AGODA",
        checkin=dt.date(2026, 3, 4),
        checkout=dt.date(2026, 3, 5),
        nights=1,
        room_no="702",
        status="RR",
        status_bucket="ACTIVE",
    )

    issues = cross_validate_sheet_vs_sources([block], [active_source])
    issue_types = {row.get("type") for row in issues}
    assert "EXPECTED_MANUAL_OTA_ON_SHEET" in issue_types

    print("regression_manual_ota_sheet_only_py: OK")


if __name__ == "__main__":
    main()
