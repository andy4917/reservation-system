from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.domain.sheet_domain import ReservationBlock, SourceReservation
from src.reconcile.sheet_reconcile import cross_validate_sheet_vs_sources


def build_block(reservation_no: str, platform: str, price: int) -> ReservationBlock:
    return ReservationBlock(
        row=1,
        room_type="Urban Spa Suite 6in",
        room_no="701",
        start_col=1,
        end_col=2,
        checkin=dt.date(2026, 3, 8),
        checkout=dt.date(2026, 3, 10),
        nights=2,
        price=price,
        note="",
        reservation_no=reservation_no,
        reservation_key=reservation_no,
        branch="GANGNAM",
        channel=platform,
        platform=platform,
    )


def build_source(
    reservation_no: str,
    channel: str,
    source_price: int,
    reservation_ref: str,
) -> SourceReservation:
    return SourceReservation(
        source_system="PMS",
        reservation_no=reservation_no,
        channel=channel,
        checkin=dt.date(2026, 3, 8),
        checkout=dt.date(2026, 3, 10),
        nights=2,
        room_no="701",
        price=source_price,
        account=channel,
        status="RR",
        status_bucket="ACTIVE",
        branch="GANGNAM",
        reservation_ref=reservation_ref,
    )


def main() -> None:
    # BOOKING net(82.5%) vs gross mismatch should be suppressed.
    booking_sheet = build_block("5981237791", "BOOKING", 1232550)
    booking_source = build_source("26183904", "BOOKING", 1494000, "5981237791-6068429992")
    booking_issues = cross_validate_sheet_vs_sources([booking_sheet], [booking_source])
    booking_issue_types = {row.get("type") for row in booking_issues}
    assert "PRICE_MISMATCH_SOURCE" not in booking_issue_types

    # EXPEDIA pricing is treated as variable settlement and should be suppressed.
    expedia_sheet = build_block("2294504032", "EXPEDIA", 892296)
    expedia_source = build_source("25152590", "EXPEDIA", 922992, "2294504032")
    expedia_issues = cross_validate_sheet_vs_sources([expedia_sheet], [expedia_source])
    expedia_issue_types = {row.get("type") for row in expedia_issues}
    assert "PRICE_MISMATCH_SOURCE" not in expedia_issue_types

    print("regression_price_commission_match_py: OK")


if __name__ == "__main__":
    main()
