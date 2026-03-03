from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.report.ops_sheet_export import build_ops_sheet_export_bundle


def main() -> None:
    orderlist_rows = [
        {
            "date": "2026-03-05",
            "branch": "COEX",
            "building": "B동",
            "room_no": "401",
            "task_label": "긴급클리닝",
            "turnover_flag": "Y",
            "arrival_reservation_nos": "ARR-401",
            "departure_reservation_nos": "DEP-401",
            "channels": "NAVER|AGODA",
            "note_heads": "12LCO guest",
        },
        {
            "date": "2026-03-05",
            "branch": "COEX",
            "building": "A동",
            "room_no": "A701",
            "task_label": "룸클리닝",
            "turnover_flag": "",
            "arrival_reservation_nos": "",
            "departure_reservation_nos": "",
            "channels": "BOOKING",
        },
        {
            "date": "2026-03-05",
            "branch": "GANGNAM",
            "building": "",
            "room_no": "1001",
            "task_label": "룸메이크업",
            "turnover_flag": "",
            "arrival_reservation_nos": "",
            "departure_reservation_nos": "",
            "channels": "STATION",
        },
    ]
    arrival_rows = [
        {
            "section": "ARRIVAL",
            "date": "2026-03-05",
            "branch": "COEX",
            "building": "B동",
            "room_no": "401",
            "reservation_no": "ARR-401",
            "channel": "NAVER",
            "checkin": "2026-03-05",
            "checkout": "2026-03-07",
            "turnover_flag": "Y",
            "arrival_reservation_nos": "ARR-401",
            "departure_reservation_nos": "DEP-401",
            "note_head": "",
        },
        {
            "section": "TURNOVER",
            "date": "2026-03-05",
            "branch": "COEX",
            "building": "A동",
            "room_no": "A701",
            "reservation_no": "TURN-701",
            "channel": "BOOKING",
            "checkin": "2026-03-05",
            "checkout": "2026-03-06",
            "turnover_flag": "Y",
            "arrival_reservation_nos": "TURN-701A",
            "departure_reservation_nos": "TURN-701D",
            "note_head": "note",
        },
    ]

    bundle = build_ops_sheet_export_bundle(orderlist_rows, arrival_rows, spreadsheet_id="dummy")

    assert bundle["tabs"] == ["코엑스", "코엑스2", "강남"]

    order_packets = {item["tab_name"]: item for item in bundle["orderlist_packets"]}
    assert order_packets["코엑스"]["rows"][0]["객실번호"] == "401"
    assert order_packets["코엑스"]["rows"][0]["지점명"] == "UH suite 더 코엑스"
    assert order_packets["코엑스"]["rows"][0]["체크인"] == "15:00"
    assert order_packets["코엑스"]["rows"][0]["체크아웃"] == "12:00"
    assert order_packets["코엑스"]["suggested_paste_start_row"] == 4
    assert "턴오버" in order_packets["코엑스"]["rows"][0]["추가 코멘트"]
    assert order_packets["코엑스"]["paste_tsv"].count("\n") == order_packets["코엑스"]["row_count"]

    assert order_packets["코엑스2"]["rows"][0]["객실번호"] == "701"
    assert order_packets["코엑스2"]["rows"][0]["지점명"] == "UH suite 더 코엑스2"
    assert order_packets["강남"]["rows"][0]["지점명"] == "UH Suite 강남"

    arrival_packets = {item["tab_name"]: item for item in bundle["arrival_packets"]}
    assert arrival_packets["코엑스"]["rows"][0]["객실번호"] == "401"
    assert arrival_packets["코엑스2"]["rows"][0]["객실번호"] == "701"
    assert arrival_packets["코엑스2"]["rows"][0]["구분"] == "TURNOVER"
    assert "턴오버" in arrival_packets["코엑스2"]["rows"][0]["비고"]

    print("regression_ops_sheet_export_py: OK")


if __name__ == "__main__":
    main()
