from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.app_v2_reservation_management_bridge import build_management_payload, make_source_reservation
from reservation_sheet_audit import ReservationBlock


def make_block(reservation_no: str, room_no: str, checkin: str, checkout: str, branch: str, channel: str) -> ReservationBlock:
    checkin_date = dt.date.fromisoformat(checkin)
    checkout_date = dt.date.fromisoformat(checkout)
    nights = max((checkout_date - checkin_date).days, 1)
    return ReservationBlock(
        row=0,
        room_type="Urban Suite",
        room_no=room_no,
        start_col=0,
        end_col=max(nights - 1, 0),
        checkin=checkin_date,
        checkout=checkout_date,
        nights=nights,
        price=120000,
        note="",
        reservation_no=reservation_no,
        reservation_key=reservation_no,
        branch=branch,
        channel=channel,
        platform=channel,
        source_columns=list(range(nights)),
    )


def main() -> None:
    blocks = [
        make_block("COEX-A", "401", "2026-03-20", "2026-03-22", "COEX", "NAVER"),
        make_block("COEX-B", "A701", "2026-03-21", "2026-03-22", "COEX", "BOOKING"),
    ]
    source_records = [
        make_source_reservation(
            {
                "source_system": "PMS",
                "reservation_no": "COEX-A",
                "channel": "NAVER",
                "checkin": "2026-03-20",
                "checkout": "2026-03-22",
                "nights": 2,
                "room_no": "401",
                "status": "RR",
                "status_bucket": "ACTIVE",
                "branch": "COEX",
            }
        ),
        make_source_reservation(
            {
                "source_system": "OTA",
                "reservation_no": "COEX-B",
                "channel": "AGODA",
                "checkin": "2026-03-21",
                "checkout": "2026-03-22",
                "nights": 1,
                "room_no": "A702",
                "status": "RR",
                "status_bucket": "ACTIVE",
                "branch": "COEX",
            }
        ),
    ]

    compare_payload = build_management_payload(
        action="compare",
        branch="COEX",
        blocks=blocks,
        source_records=source_records,
        checked_at="2026-04-04T00:00:00",
    )
    assert compare_payload["mode"] == "compare"
    assert compare_payload["engineStatus"] == "planned"
    assert compare_payload["issueCount"] > 0
    assert compare_payload["rows"]

    reconcile_payload = build_management_payload(
        action="reconcile",
        branch="COEX",
        blocks=blocks,
        source_records=source_records,
        checked_at="2026-04-04T00:00:00",
    )
    assert reconcile_payload["mode"] == "reconcile"
    assert reconcile_payload["engineStatus"] == "planned"
    assert reconcile_payload["issueCount"] > 0
    assert reconcile_payload["rows"]

    apply_payload = build_management_payload(
        action="apply",
        branch="COEX",
        blocks=blocks,
        source_records=source_records,
        checked_at="2026-04-04T00:00:00",
    )
    assert apply_payload["mode"] == "apply"
    assert apply_payload["engineStatus"] == "planned"
    assert apply_payload["planToken"]
    assert apply_payload["requiresApproval"] is True
    assert apply_payload["applyAllowed"] is False
    assert apply_payload["rows"]

    print("regression_app_v2_management_bridge_py: OK")


if __name__ == "__main__":
    main()
