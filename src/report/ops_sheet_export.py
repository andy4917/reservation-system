from __future__ import annotations

import csv
import io
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List

from src.domain.ops_sheet_policy import (
    DEFAULT_OPS_SHEET_TABS,
    format_ops_sheet_room_no,
    resolve_ops_sheet_tab,
)
from src.domain.sheet_domain import normalize_room_no_key, normalize_text
from src.io.sheets_api import GoogleSheetsReadonlyClient

ORDERLIST_PACKET_FIELDNAMES = [
    "No.",
    "청소요청일",
    "지점명",
    "객실번호",
    "업무형태",
    "체크아웃",
    "체크인",
    "비밀번호",
    "추가 코멘트",
]

ARRIVAL_PACKET_FIELDNAMES = [
    "No.",
    "날짜",
    "지점명",
    "객실번호",
    "구분",
    "예약번호",
    "채널",
    "체크인",
    "체크아웃",
    "비고",
]

ARRIVAL_TEMPLATE_SPREADSHEET_ID = "1S-Dw_UEB3A2gXyf834BJfuNolDzz_hR8TsJfcTjEj7g"
ARRIVAL_TEMPLATE_SHEET_NAME = "Arrival"
ARRIVAL_TEMPLATE_ROOM_LAYOUT = {
    "B동": [
        "201", "202", "301", "302", "401", "402", "501", "502", "601", "602", "701",
        "702", "801", "802", "901", "902", "1001", "1002", "1101", "1102", "1201", "1202",
    ],
    "A동": [
        "A301", "A302", "A401", "A402", "A501", "A502", "A601", "A602", "A701", "A702",
        "A801", "A802", "A901", "A902", "A1001", "A1002", "A1101", "A1102", "A1201",
    ],
}


def build_ops_sheet_export_bundle(
    orderlist_rows: List[Dict[str, Any]],
    arrival_rows: List[Dict[str, Any]],
    *,
    client: GoogleSheetsReadonlyClient | None = None,
    spreadsheet_id: str = "",
) -> Dict[str, Any]:
    orderlist_packets = build_orderlist_sheet_packets(orderlist_rows)
    arrival_packets = build_arrival_template_packets(orderlist_rows, arrival_rows)
    snapshot = (
        load_ops_sheet_tab_snapshots(client=client, spreadsheet_id=spreadsheet_id)
        if client and spreadsheet_id
        else {}
    )
    enrich_packets_with_snapshot(orderlist_packets, snapshot)
    return {
        "spreadsheet_id": spreadsheet_id,
        "tabs": [policy.tab_name for policy in DEFAULT_OPS_SHEET_TABS],
        "orderlist_packets": orderlist_packets,
        "arrival_packets": arrival_packets,
        "arrival_template": {
            "spreadsheet_id": ARRIVAL_TEMPLATE_SPREADSHEET_ID,
            "sheet_name": ARRIVAL_TEMPLATE_SHEET_NAME,
        },
        "tab_snapshots": snapshot,
    }


def enrich_packets_with_snapshot(
    packets: List[Dict[str, Any]],
    snapshot: Dict[str, Any],
) -> None:
    for packet in packets:
        tab_name = normalize_text(packet.get("tab_name", ""))
        tab_snapshot = snapshot.get(tab_name, {})
        packet["suggested_paste_start_row"] = int(
            tab_snapshot.get("suggested_paste_start_row", 4) or 4
        )


def build_orderlist_sheet_packets(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    meta_by_tab: Dict[str, Dict[str, str]] = {}
    for row in rows:
        policy = resolve_ops_sheet_tab(row.get("branch", ""), row.get("building", ""))
        if policy is None:
            continue
        comment = build_orderlist_comment(row)
        grouped[policy.tab_name].append(
            {
                "청소요청일": normalize_text(row.get("date", "")).replace("-", ""),
                "지점명": policy.property_label,
                "객실번호": format_ops_sheet_room_no(str(row.get("room_no", ""))),
                "업무형태": normalize_text(row.get("task_label", "")),
                "체크아웃": infer_checkout_time(row, comment),
                "체크인": "15:00" if normalize_text(row.get("task_label", "")) == "긴급클리닝" else "",
                "비밀번호": "",
                "추가 코멘트": comment,
            }
        )
        meta_by_tab[policy.tab_name] = {
            "tab_name": policy.tab_name,
            "property_label": policy.property_label,
        }
    return [
        finalize_packet(
            packet_type="orderlist",
            tab_name=tab_name,
            property_label=meta_by_tab[tab_name]["property_label"],
            rows=packet_rows,
            fieldnames=ORDERLIST_PACKET_FIELDNAMES,
        )
        for tab_name, packet_rows in sorted(grouped.items())
    ]


def build_arrival_template_packets(
    orderlist_rows: List[Dict[str, Any]],
    arrival_rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    by_date: Dict[str, Dict[str, Any]] = {}
    for row in orderlist_rows:
        date_key = normalize_text(row.get("date", ""))
        if not date_key:
            continue
        bucket = by_date.setdefault(date_key, {"orderlist": [], "arrival": []})
        bucket["orderlist"].append(row)
    for row in arrival_rows:
        date_key = normalize_text(row.get("date", ""))
        if not date_key:
            continue
        bucket = by_date.setdefault(date_key, {"orderlist": [], "arrival": []})
        bucket["arrival"].append(row)
    return [
        build_arrival_template_packet(
            date_key=date_key,
            orderlist_rows=bucket["orderlist"],
            arrival_rows=bucket["arrival"],
        )
        for date_key, bucket in sorted(by_date.items())
        if bucket["orderlist"] or bucket["arrival"]
    ]


def build_arrival_template_packet(
    *,
    date_key: str,
    orderlist_rows: List[Dict[str, Any]],
    arrival_rows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    order_by_room = {
        normalize_room_no_key(row.get("room_no", "")): row for row in orderlist_rows
    }
    arrival_by_room: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in arrival_rows:
        room_key = normalize_room_no_key(row.get("room_no", ""))
        if room_key:
            arrival_by_room[room_key].append(row)

    grid_rows: List[Dict[str, Any]] = []
    cell_updates: List[Dict[str, str]] = [{"range": "B2", "value": format_arrival_template_date(date_key)}]
    for building, rooms in ARRIVAL_TEMPLATE_ROOM_LAYOUT.items():
        label_col, dep_col, arr_col = ("B", "C", "D") if building == "B동" else ("F", "G", "H")
        start_row = 5
        for offset, room_no in enumerate(rooms):
            row_no = start_row + offset
            room_key = normalize_room_no_key(room_no)
            order_row = order_by_room.get(room_key)
            room_arrivals = arrival_by_room.get(room_key, [])
            departure_text, arrival_text = infer_arrival_template_cell_texts(
                order_row=order_row,
                arrival_rows=room_arrivals,
            )
            room_label = format_arrival_template_room_label(room_no)
            grid_rows.append(
                {
                    "date": date_key,
                    "building": building,
                    "room_no": room_no,
                    "room_label": room_label,
                    "departure_text": departure_text,
                    "arrival_text": arrival_text,
                }
            )
            cell_updates.extend(
                [
                    {"range": f"{label_col}{row_no}", "value": room_label},
                    {"range": f"{dep_col}{row_no}", "value": departure_text},
                    {"range": f"{arr_col}{row_no}", "value": arrival_text},
                ]
            )
    return {
        "packet_type": "arrival-template",
        "template_kind": "coex-arrival-board",
        "spreadsheet_id": ARRIVAL_TEMPLATE_SPREADSHEET_ID,
        "sheet_name": ARRIVAL_TEMPLATE_SHEET_NAME,
        "report_date": date_key,
        "display_date": format_arrival_template_date(date_key),
        "row_count": len(grid_rows),
        "grid_rows": grid_rows,
        "cell_updates": cell_updates,
        "legacy_fieldnames": ARRIVAL_PACKET_FIELDNAMES,
        "legacy_rows": sorted(
            [
                {
                    "No.": idx,
                    "날짜": normalize_text(row.get("date", "")).replace("-", ""),
                    "지점명": resolve_ops_sheet_tab(row.get("branch", ""), row.get("building", "")).property_label,
                    "객실번호": format_ops_sheet_room_no(str(row.get("room_no", ""))),
                    "구분": normalize_text(row.get("section", "")),
                    "예약번호": normalize_text(row.get("reservation_no", "")),
                    "채널": normalize_text(row.get("channel", "")),
                    "체크인": normalize_text(row.get("checkin", "")),
                    "체크아웃": normalize_text(row.get("checkout", "")),
                    "비고": build_arrival_comment(row),
                }
                for idx, row in enumerate(
                    sorted(
                        [
                            row for row in arrival_rows
                            if resolve_ops_sheet_tab(row.get("branch", ""), row.get("building", "")) is not None
                        ],
                        key=lambda item: (
                            normalize_text(item.get("date", "")),
                            normalize_room_no_key(item.get("room_no", "")),
                            normalize_text(item.get("section", "")),
                        ),
                    ),
                    start=1,
                )
            ],
            key=lambda item: (item["날짜"], item["객실번호"], item["구분"]),
        ),
    }


def finalize_packet(
    *,
    packet_type: str,
    tab_name: str,
    property_label: str,
    rows: List[Dict[str, Any]],
    fieldnames: List[str],
) -> Dict[str, Any]:
    sorted_rows = sorted(
        rows,
        key=lambda item: (
            normalize_text(item.get("청소요청일", item.get("날짜", ""))),
            int("".join(ch for ch in str(item.get("객실번호", "")) if ch.isdigit()) or "0"),
        ),
    )
    numbered_rows = []
    for idx, row in enumerate(sorted_rows, start=1):
        numbered = {"No.": idx}
        numbered.update(row)
        numbered_rows.append(numbered)
    return {
        "packet_type": packet_type,
        "tab_name": tab_name,
        "property_label": property_label,
        "fieldnames": fieldnames,
        "row_count": len(numbered_rows),
        "rows": numbered_rows,
        "tsv": rows_to_delimited_text(numbered_rows, fieldnames, delimiter="\t"),
        "csv": rows_to_delimited_text(numbered_rows, fieldnames, delimiter=","),
        "paste_tsv": rows_to_delimited_text(numbered_rows, fieldnames, delimiter="\t", include_header=False),
        "paste_csv": rows_to_delimited_text(numbered_rows, fieldnames, delimiter=",", include_header=False),
    }


def rows_to_delimited_text(
    rows: Iterable[Dict[str, Any]],
    fieldnames: List[str],
    delimiter: str,
    include_header: bool = True,
) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, delimiter=delimiter, lineterminator="\n")
    if include_header:
        writer.writeheader()
    for row in rows:
        writer.writerow({field: row.get(field, "") for field in fieldnames})
    return buf.getvalue()


def build_orderlist_comment(row: Dict[str, Any]) -> str:
    parts = []
    if normalize_text(row.get("turnover_flag", "")) == "Y":
        parts.append("턴오버")
    arrivals = normalize_text(row.get("arrival_reservation_nos", ""))
    departures = normalize_text(row.get("departure_reservation_nos", ""))
    if arrivals:
        parts.append(f"ARR {arrivals}")
    if departures:
        parts.append(f"DEP {departures}")
    channels = normalize_text(row.get("channels", ""))
    if channels:
        parts.append(f"채널 {channels}")
    note_heads = normalize_text(row.get("note_heads", ""))
    if note_heads:
        parts.append(note_heads)
    return " / ".join(parts)


def infer_checkout_time(row: Dict[str, Any], comment: str) -> str:
    if normalize_text(row.get("task_label", "")) != "긴급클리닝":
        return ""
    if "LCO" in comment.upper():
        return "12:00"
    return "11:00"


def build_arrival_comment(row: Dict[str, Any]) -> str:
    parts = []
    if normalize_text(row.get("turnover_flag", "")) == "Y":
        parts.append("턴오버")
    arrival_reservation_nos = normalize_text(row.get("arrival_reservation_nos", ""))
    departure_reservation_nos = normalize_text(row.get("departure_reservation_nos", ""))
    if arrival_reservation_nos and normalize_text(row.get("section", "")) != "ARRIVAL":
        parts.append(f"ARR {arrival_reservation_nos}")
    if departure_reservation_nos and normalize_text(row.get("section", "")) != "DEPARTURE":
        parts.append(f"DEP {departure_reservation_nos}")
    note_head = normalize_text(row.get("note_head", ""))
    if note_head:
        parts.append(note_head)
    return " / ".join(parts)


def format_arrival_template_date(value: str) -> str:
    text = normalize_text(value)
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return f"{int(text[5:7])}/{int(text[8:10])}"
    return text


def format_arrival_template_room_label(room_no: str) -> str:
    text = normalize_text(room_no).upper()
    if text.startswith("A"):
        return f"A {text[1:]}"
    return f"B {format_ops_sheet_room_no(text)}"


def infer_arrival_template_cell_texts(
    *,
    order_row: Dict[str, Any] | None,
    arrival_rows: List[Dict[str, Any]],
) -> tuple[str, str]:
    task_label = normalize_text((order_row or {}).get("task_label", ""))
    note_heads = normalize_text((order_row or {}).get("note_heads", ""))
    has_turnover = any(normalize_text(row.get("section", "")) == "TURNOVER" for row in arrival_rows)
    arrival_only = [row for row in arrival_rows if normalize_text(row.get("section", "")) == "ARRIVAL"]
    departure_only = [row for row in arrival_rows if normalize_text(row.get("section", "")) == "DEPARTURE"]

    if task_label == "룸메이크업" and not arrival_rows:
        return "재실", "재실"
    if task_label == "룸클리닝":
        return "전체청소", "전체청소"
    if has_turnover:
        return "전체청소", "전체청소"

    departure_text = "공실"
    arrival_text = "공실"

    if departure_only:
        departure_text = infer_departure_display(departure_only, note_heads=note_heads)
        arrival_text = "공실"
    if arrival_only:
        arrival_text = infer_arrival_display(arrival_only)
        if not departure_only:
            departure_text = ""
    if task_label == "긴급클리닝" and not arrival_text:
        arrival_text = "전체청소"
    return departure_text, arrival_text


def infer_departure_display(rows: List[Dict[str, Any]], *, note_heads: str = "") -> str:
    merged = " ".join(
        [note_heads] + [normalize_text(row.get("note_head", "")) for row in rows] + [build_arrival_comment(row) for row in rows]
    ).upper()
    if "LCO" in merged:
        return "12LCO"
    return ""


def infer_arrival_display(rows: List[Dict[str, Any]]) -> str:
    first = rows[0] if rows else {}
    nationality_nights = normalize_text(first.get("nationality_nights", ""))
    if nationality_nights:
        return nationality_nights
    note_head = normalize_text(first.get("note_head", ""))
    if note_head and "LCO" not in note_head.upper():
        return note_head
    nights = normalize_text(first.get("nights", ""))
    channel = normalize_text(first.get("channel", ""))
    if nights.isdigit():
        channel_label = channel or "미상"
        return f"{channel_label} {int(nights)}박"
    return ""


def load_ops_sheet_tab_snapshots(
    *,
    client: GoogleSheetsReadonlyClient,
    spreadsheet_id: str,
) -> Dict[str, Any]:
    ranges = [f"{policy.tab_name}!A1:I200" for policy in DEFAULT_OPS_SHEET_TABS]
    value_ranges = client.batch_get_values(spreadsheet_id=spreadsheet_id, ranges=ranges)
    snapshot: Dict[str, Any] = {}
    for item in value_ranges:
        range_name = normalize_text(item.get("range", ""))
        tab_name = range_name.split("!")[0].strip("'") if "!" in range_name else range_name
        values = item.get("values", [])
        snapshot[tab_name] = {
            "range": range_name,
            "values": values,
            "suggested_paste_start_row": infer_suggested_paste_start_row(values),
        }
    return snapshot


def infer_suggested_paste_start_row(values: List[List[Any]]) -> int:
    last_with_number = 0
    for idx, row in enumerate(values, start=1):
        first = normalize_text(row[0] if row else "")
        if first.isdigit():
            last_with_number = idx
    return max(last_with_number + 1, 4)


def write_packet_text_files(
    out_dir: Path,
    prefix: str,
    packets: List[Dict[str, Any]],
) -> None:
    for packet in packets:
        if "tsv" not in packet or "csv" not in packet:
            continue
        tab_name = normalize_text(packet.get("tab_name", "")).replace(" ", "_")
        (out_dir / f"{prefix}_{tab_name}.tsv").write_text(packet.get("tsv", ""), encoding="utf-8-sig")
        (out_dir / f"{prefix}_{tab_name}.csv").write_text(packet.get("csv", ""), encoding="utf-8-sig")
