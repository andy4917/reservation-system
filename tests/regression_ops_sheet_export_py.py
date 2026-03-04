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
            "nationality_nights": "한국 2박",
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
            "nationality_nights": "싱가포르 1박",
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

    arrival_packet = bundle["arrival_packets"][0]
    assert arrival_packet["packet_type"] == "arrival-template"
    assert arrival_packet["sheet_name"] == "Arrival"
    assert arrival_packet["display_date"] == "3/5"
    by_room = {item["room_no"]: item for item in arrival_packet["grid_rows"]}
    assert by_room["401"]["arrival_text"] == "한국 2박"
    assert by_room["401"]["departure_text"] == ""
    assert by_room["A701"]["departure_text"] == "전체청소"
    assert by_room["A701"]["arrival_text"] == "전체청소"
    assert any(item["range"] == "B2" and item["value"] == "3/5" for item in arrival_packet["cell_updates"])
    assert arrival_packet["legacy_rows"][0]["객실번호"] == "401"

    print("regression_ops_sheet_export_py: OK")


if __name__ == "__main__":
    main()
