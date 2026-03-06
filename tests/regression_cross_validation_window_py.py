from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_audit import (  # noqa: E402
    filter_cross_validation_inputs_by_report_window,
)
from src.domain.sheet_domain import ReservationBlock, SourceReservation  # noqa: E402


def make_block(checkin: dt.date, checkout: dt.date) -> ReservationBlock:
    return ReservationBlock(
        row=1,
        room_type="Urban Spa Suite 6in",
        room_no="701",
        start_col=1,
        end_col=2,
        checkin=checkin,
        checkout=checkout,
        nights=max((checkout - checkin).days, 1),
        price=None,
        note="",
        reservation_no="R1",
        reservation_key="R1",
        branch="COEX",
        channel="AGODA",
        platform="AGODA",
    )


def make_source(checkin: dt.date, checkout: dt.date) -> SourceReservation:
    return SourceReservation(
        source_system="PMS",
        reservation_no="S1",
        channel="AGODA",
        checkin=checkin,
        checkout=checkout,
        nights=max((checkout - checkin).days, 1),
        room_no="701",
        branch="COEX",
        status_bucket="ACTIVE",
    )


def main() -> None:
    blocks = [
        make_block(dt.date(2026, 3, 6), dt.date(2026, 3, 8)),
        make_block(dt.date(2026, 2, 20), dt.date(2026, 2, 22)),
    ]
    sources = [
        make_source(dt.date(2026, 3, 7), dt.date(2026, 3, 9)),
        make_source(dt.date(2026, 2, 18), dt.date(2026, 2, 19)),
    ]

    fb, fs, scope = filter_cross_validation_inputs_by_report_window(
        blocks,
        sources,
        "2026-03-06",
        "2026-03-09",
    )
    assert len(fb) == 1
    assert len(fs) == 1
    assert scope["enabled"] is True
    assert scope["blocks_before"] == 2
    assert scope["blocks_after"] == 1
    assert scope["sources_before"] == 2
    assert scope["sources_after"] == 1

    # PMS sources are arrival-scoped for this window (no pre-start arrivals),
    # so carry-over sheet stays that start before window are excluded.
    blocks_arrival = [make_block(dt.date(2026, 3, 5), dt.date(2026, 3, 8))]
    sources_arrival = [make_source(dt.date(2026, 3, 6), dt.date(2026, 3, 7))]
    fb3, fs3, scope3 = filter_cross_validation_inputs_by_report_window(
        blocks_arrival,
        sources_arrival,
        "2026-03-06",
        "2026-03-09",
    )
    assert len(fs3) == 1
    assert len(fb3) == 0
    assert scope3["source_scope_mode"] == "pms_arrival_checkin"
    assert scope3["pre_arrival_blocks_removed"] == 1

    fb2, fs2, scope2 = filter_cross_validation_inputs_by_report_window(
        blocks,
        sources,
        "",
        "",
    )
    assert len(fb2) == 2
    assert len(fs2) == 2
    assert scope2["enabled"] is False

    print("regression_cross_validation_window_py: OK")


if __name__ == "__main__":
    main()
