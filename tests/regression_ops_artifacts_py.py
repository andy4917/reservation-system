from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.domain.report_policy import OrderlistPolicy
from src.report.ops_artifact_report import build_arrival_artifact, build_orderlist_artifact
from src.domain.sheet_domain import ReservationBlock


def build_block(
    reservation_no: str,
    room_no: str,
    checkin: dt.date,
    checkout: dt.date,
    channel: str = "NAVER",
) -> ReservationBlock:
    return ReservationBlock(
        row=0,
        room_type="Urban Spa Suite 6in",
        room_no=room_no,
        start_col=0,
        end_col=0,
        checkin=checkin,
        checkout=checkout,
        nights=(checkout - checkin).days,
        price=100000,
        note=f"note {reservation_no}",
        reservation_no=reservation_no,
        reservation_key=reservation_no,
        branch="COEX",
        channel=channel,
        platform=channel,
    )


def main() -> None:
    report_day = dt.date(2026, 3, 5)
    blocks = [
        build_block("TURNOUT-DEP", "A301", dt.date(2026, 3, 2), dt.date(2026, 3, 5), "AGODA"),
        build_block("TURNOUT-ARR", "A301", dt.date(2026, 3, 5), dt.date(2026, 3, 7), "NAVER"),
        build_block("STAY-401", "401", dt.date(2026, 3, 4), dt.date(2026, 3, 7), "STATION"),
        build_block("LONG-601", "601", dt.date(2026, 3, 2), dt.date(2026, 3, 7), "BOOKING"),
        build_block("DEP-501", "501", dt.date(2026, 3, 3), dt.date(2026, 3, 5), "BOOKING"),
    ]

    orderlist = build_orderlist_artifact(blocks, report_day, report_day)
    by_room = {row["room_no"]: row for row in orderlist["rows"]}

    assert by_room["A301"]["task_label"] == "긴급클리닝"
    assert by_room["A301"]["task_rule_id"] == "arrival_emergency_cleaning"
    assert by_room["A301"]["building"] == "A동"
    assert by_room["A301"]["ops_room_label"] == "A301"
    assert by_room["401"]["task_label"] == "룸메이크업"
    assert by_room["401"]["continuation_candidate"] == ""
    assert by_room["401"]["ops_room_label"] == "B401"
    assert by_room["601"]["task_label"] == "룸클리닝"
    assert by_room["601"]["task_rule_id"] == "periodic_room_cleaning"
    assert "501" not in by_room

    no_room_makeup = build_orderlist_artifact(
        blocks,
        report_day,
        report_day,
        policy=OrderlistPolicy(exclude_room_makeup=True),
    )
    no_room_makeup_rooms = {row["room_no"] for row in no_room_makeup["rows"]}
    assert "401" not in no_room_makeup_rooms

    continuation_blocks = [
        build_block("CONT-DEP", "901", dt.date(2026, 3, 2), dt.date(2026, 3, 5), "STATION"),
        build_block("CONT-ARR", "901", dt.date(2026, 3, 5), dt.date(2026, 3, 8), "NAVER"),
    ]
    continuation_blocks[0].note = "예약번호: CONT-DEP\n예약자: Alex Kim"
    continuation_blocks[1].note = "예약번호: CONT-ARR\n예약자: Alex Kim"

    continuation_arrival = build_arrival_artifact(continuation_blocks, report_day, report_day)
    continuation_turnover = [row for row in continuation_arrival["rows"] if row["room_no"] == "901"][0]
    assert continuation_turnover["continuation_candidate"] == "Y"
    assert "guest_name" in continuation_turnover["continuation_basis"]

    arrival = build_arrival_artifact(blocks, report_day, report_day)
    section_counts = arrival["counts"]["by_section"]
    assert section_counts == {"TURNOVER": 1, "DEPARTURE": 1}

    turnover_rows = [row for row in arrival["rows"] if row["section"] == "TURNOVER"]
    assert len(turnover_rows) == 1
    assert turnover_rows[0]["room_no"] == "A301"
    assert turnover_rows[0]["arrival_reservation_nos"] == "TURNOUT-ARR"
    assert turnover_rows[0]["departure_reservation_nos"] == "TURNOUT-DEP"
    assert turnover_rows[0]["building"] == "A동"
    assert turnover_rows[0]["continuation_candidate"] == ""

    print("regression_ops_artifacts_py: OK")


if __name__ == "__main__":
    main()
