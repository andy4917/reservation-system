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
from src.domain.sheet_domain import normalize_text
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


def build_ops_sheet_export_bundle(
    orderlist_rows: List[Dict[str, Any]],
    arrival_rows: List[Dict[str, Any]],
    *,
    client: GoogleSheetsReadonlyClient | None = None,
    spreadsheet_id: str = "",
) -> Dict[str, Any]:
    orderlist_packets = build_orderlist_sheet_packets(orderlist_rows)
    arrival_packets = build_arrival_sheet_packets(arrival_rows)
    snapshot = (
        load_ops_sheet_tab_snapshots(client=client, spreadsheet_id=spreadsheet_id)
        if client and spreadsheet_id
        else {}
    )
    enrich_packets_with_snapshot(orderlist_packets, snapshot)
    enrich_packets_with_snapshot(arrival_packets, snapshot)
    return {
        "spreadsheet_id": spreadsheet_id,
        "tabs": [policy.tab_name for policy in DEFAULT_OPS_SHEET_TABS],
        "orderlist_packets": orderlist_packets,
        "arrival_packets": arrival_packets,
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


def build_arrival_sheet_packets(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    meta_by_tab: Dict[str, Dict[str, str]] = {}
    for row in rows:
        policy = resolve_ops_sheet_tab(row.get("branch", ""), row.get("building", ""))
        if policy is None:
            continue
        grouped[policy.tab_name].append(
            {
                "날짜": normalize_text(row.get("date", "")).replace("-", ""),
                "지점명": policy.property_label,
                "객실번호": format_ops_sheet_room_no(str(row.get("room_no", ""))),
                "구분": normalize_text(row.get("section", "")),
                "예약번호": normalize_text(row.get("reservation_no", "")),
                "채널": normalize_text(row.get("channel", "")),
                "체크인": normalize_text(row.get("checkin", "")),
                "체크아웃": normalize_text(row.get("checkout", "")),
                "비고": build_arrival_comment(row),
            }
        )
        meta_by_tab[policy.tab_name] = {
            "tab_name": policy.tab_name,
            "property_label": policy.property_label,
        }
    return [
        finalize_packet(
            packet_type="arrival",
            tab_name=tab_name,
            property_label=meta_by_tab[tab_name]["property_label"],
            rows=packet_rows,
            fieldnames=ARRIVAL_PACKET_FIELDNAMES,
        )
        for tab_name, packet_rows in sorted(grouped.items())
    ]


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
        tab_name = normalize_text(packet.get("tab_name", "")).replace(" ", "_")
        (out_dir / f"{prefix}_{tab_name}.tsv").write_text(packet.get("tsv", ""), encoding="utf-8-sig")
        (out_dir / f"{prefix}_{tab_name}.csv").write_text(packet.get("csv", ""), encoding="utf-8-sig")
