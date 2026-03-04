from __future__ import annotations

import csv
import datetime as dt
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from src.domain.ops_sheet_policy import normalize_ops_sheet_spreadsheet
from src.domain.sheet_domain import AuditError, ReservationBlock, try_parse_iso_date
from src.io.sheets_api import GoogleSheetsReadonlyClient
from src.report.ops_artifact_report import (
    build_arrival_artifact,
    build_orderlist_artifact,
    write_tabular_csv,
    write_tabular_tsv,
)
from src.report.ops_sheet_export import build_ops_sheet_export_bundle, write_packet_text_files

REQUIRED_BLOCKS_CSV_COLUMNS = [
    "row",
    "room_type",
    "room_no",
    "start_col",
    "end_col",
    "checkin",
    "checkout",
    "nights",
    "checkout_exclusive",
    "price",
    "branch",
    "channel",
    "reservation_no",
    "reservation_key",
    "platform",
    "color_hex",
    "source_columns",
    "group_key",
    "part_index",
    "parts_total",
    "month_split",
    "note_head",
    "nationality_nights",
]


def build_ops_artifacts(
    blocks: List[ReservationBlock],
    *,
    report_date: str = "",
    report_start: str = "",
    report_end: str = "",
    client: Optional[GoogleSheetsReadonlyClient] = None,
    ops_sheet_spreadsheet: str = "",
) -> Dict[str, Any]:
    report_window = resolve_report_window(
        blocks,
        report_date=report_date,
        report_start=report_start,
        report_end=report_end,
    )
    orderlist_artifact = build_orderlist_artifact(
        blocks, report_window["start_date"], report_window["end_date"]
    )
    arrival_artifact = build_arrival_artifact(
        blocks, report_window["start_date"], report_window["end_date"]
    )
    ops_sheet_bundle = build_ops_sheet_export_bundle(
        orderlist_artifact["rows"],
        arrival_artifact["rows"],
        client=client,
        spreadsheet_id=normalize_ops_sheet_spreadsheet(ops_sheet_spreadsheet),
    )
    return {
        "report_window": {
            "start": report_window["start"],
            "end": report_window["end"],
        },
        "orderlist_artifact": orderlist_artifact,
        "arrival_artifact": arrival_artifact,
        "ops_sheet_bundle": ops_sheet_bundle,
    }


def write_ops_outputs(out_dir: Path, artifacts: Dict[str, Any]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    write_tabular_csv(
        out_dir / "orderlist_report.csv",
        artifacts["orderlist_artifact"]["rows"],
        artifacts["orderlist_artifact"]["fieldnames"],
    )
    write_tabular_tsv(
        out_dir / "orderlist_report.tsv",
        artifacts["orderlist_artifact"]["rows"],
        artifacts["orderlist_artifact"]["fieldnames"],
    )
    write_tabular_csv(
        out_dir / "arrival_report.csv",
        artifacts["arrival_artifact"]["rows"],
        artifacts["arrival_artifact"]["fieldnames"],
    )
    write_tabular_tsv(
        out_dir / "arrival_report.tsv",
        artifacts["arrival_artifact"]["rows"],
        artifacts["arrival_artifact"]["fieldnames"],
    )
    with (out_dir / "ops_sheet_packets.json").open("w", encoding="utf-8") as f:
        json.dump(artifacts["ops_sheet_bundle"], f, ensure_ascii=False, indent=2)
    write_packet_text_files(
        out_dir,
        "orderlist_ops",
        artifacts["ops_sheet_bundle"]["orderlist_packets"],
    )
    write_packet_text_files(
        out_dir,
        "arrival_ops",
        artifacts["ops_sheet_bundle"]["arrival_packets"],
    )
    for packet in artifacts["ops_sheet_bundle"]["arrival_packets"]:
        report_date = str(packet.get("report_date", "") or "").replace("-", "") or "unknown"
        with (out_dir / f"arrival_ops_{report_date}.json").open("w", encoding="utf-8") as f:
            json.dump(packet, f, ensure_ascii=False, indent=2)


def build_ops_summary(artifacts: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "window": artifacts["report_window"],
        "orderlist": {
            "counts": artifacts["orderlist_artifact"]["counts"],
            "policy": artifacts["orderlist_artifact"]["policy"],
            "files": ["orderlist_report.csv", "orderlist_report.tsv"],
        },
        "arrival": {
            "counts": artifacts["arrival_artifact"]["counts"],
            "policy": artifacts["arrival_artifact"]["policy"],
            "files": ["arrival_report.csv", "arrival_report.tsv"],
        },
        "ops_sheet_packets": {
            "spreadsheet_id": artifacts["ops_sheet_bundle"]["spreadsheet_id"],
            "tabs": artifacts["ops_sheet_bundle"]["tabs"],
            "orderlist_packet_count": len(artifacts["ops_sheet_bundle"]["orderlist_packets"]),
            "arrival_packet_count": len(artifacts["ops_sheet_bundle"]["arrival_packets"]),
            "file": "ops_sheet_packets.json",
        },
    }


def resolve_report_window(
    blocks: List[ReservationBlock],
    *,
    report_date: str = "",
    report_start: str = "",
    report_end: str = "",
) -> Dict[str, Any]:
    single_date = try_parse_iso_date(report_date)
    if report_date and single_date is None:
        raise AuditError(f"--report-date must be YYYY-MM-DD: {report_date}")
    start_date = try_parse_iso_date(report_start)
    if report_start and start_date is None:
        raise AuditError(f"--report-start-date must be YYYY-MM-DD: {report_start}")
    end_date = try_parse_iso_date(report_end)
    if report_end and end_date is None:
        raise AuditError(f"--report-end-date must be YYYY-MM-DD: {report_end}")
    if single_date:
        start_date = single_date
        end_date = single_date
    if start_date is None:
        checkins = [block.checkin for block in blocks if block.checkin]
        start_date = min(checkins) if checkins else None
    if end_date is None:
        checkouts = [block.checkout for block in blocks if block.checkout]
        end_date = max(checkouts) if checkouts else start_date
    if start_date and end_date and start_date > end_date:
        raise AuditError(
            f"Invalid report date range: start {start_date.isoformat()} > end {end_date.isoformat()}"
        )
    return {
        "start_date": start_date,
        "end_date": end_date,
        "start": start_date.isoformat() if start_date else "",
        "end": end_date.isoformat() if end_date else "",
    }


def load_blocks_csv(path: Path) -> List[ReservationBlock]:
    if not path.exists():
        raise AuditError(f"reservation blocks CSV not found: {path}")
    blocks: List[ReservationBlock] = []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        missing_columns = [name for name in REQUIRED_BLOCKS_CSV_COLUMNS if name not in fieldnames]
        if missing_columns:
            raise AuditError(
                "reservation blocks CSV is missing required columns: "
                + ", ".join(missing_columns)
            )
        for line_no, row in enumerate(reader, start=2):
            checkin = _parse_required_iso_date(row, "checkin", line_no)
            checkout = _parse_required_iso_date(row, "checkout", line_no)
            checkout_exclusive = _parse_required_iso_date(row, "checkout_exclusive", line_no)
            source_columns = [
                _parse_positive_int(part, "source_columns", line_no) - 1
                for part in str(row.get("source_columns", "") or "").split("|")
                if str(part).strip()
            ]
            row_index = _parse_positive_int(row.get("row", ""), "row", line_no) - 1
            start_col = _parse_positive_int(row.get("start_col", ""), "start_col", line_no) - 1
            end_col = _parse_positive_int(row.get("end_col", ""), "end_col", line_no) - 1
            nights = _parse_positive_int(row.get("nights", ""), "nights", line_no)
            part_index = _parse_positive_int(row.get("part_index", ""), "part_index", line_no)
            parts_total = _parse_positive_int(row.get("parts_total", ""), "parts_total", line_no)
            price = _parse_optional_int(row.get("price", ""), "price", line_no)
            month_split = str(row.get("month_split", "") or "").strip().upper()
            if month_split not in ("", "Y"):
                raise AuditError(
                    f"reservation blocks CSV line {line_no}: invalid month_split={month_split!r}"
                )
            if start_col > end_col:
                raise AuditError(
                    f"reservation blocks CSV line {line_no}: start_col > end_col"
                )
            if checkin >= checkout:
                raise AuditError(
                    f"reservation blocks CSV line {line_no}: checkin must be earlier than checkout"
                )
            if checkout != checkout_exclusive:
                raise AuditError(
                    f"reservation blocks CSV line {line_no}: checkout and checkout_exclusive differ"
                )
            if len(source_columns) != nights:
                raise AuditError(
                    f"reservation blocks CSV line {line_no}: source_columns count does not match nights"
                )
            if source_columns and (source_columns[0] != start_col or source_columns[-1] != end_col):
                raise AuditError(
                    f"reservation blocks CSV line {line_no}: source_columns do not match start/end columns"
                )
            if part_index > parts_total:
                raise AuditError(
                    f"reservation blocks CSV line {line_no}: part_index exceeds parts_total"
                )
            blocks.append(
                ReservationBlock(
                    row=row_index,
                    room_type=_require_text(row, "room_type", line_no),
                    room_no=_require_text(row, "room_no", line_no),
                    start_col=start_col,
                    end_col=end_col,
                    checkin=checkin,
                    checkout=checkout,
                    nights=nights,
                    price=price,
                    note=str(row.get("note_head", "") or ""),
                    reservation_no=_to_optional_text(row.get("reservation_no", "")),
                    reservation_key=_require_optional_text(row, "reservation_key", line_no),
                    branch=_require_text(row, "branch", line_no),
                    channel=_require_text(row, "channel", line_no),
                    platform=_require_text(row, "platform", line_no),
                    color_hex=_to_optional_text(row.get("color_hex", "")),
                    source_columns=source_columns,
                    group_key=str(row.get("group_key", "") or ""),
                    part_index=part_index,
                    parts_total=parts_total,
                    month_split=month_split == "Y",
                    nationality_nights=str(row.get("nationality_nights", "") or ""),
                )
            )
    return blocks


def _to_optional_text(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    return text or None


def _to_optional_int(value: Any) -> Optional[int]:
    text = str(value or "").strip()
    if not text:
        return None
    return int(text)


def _require_text(row: Dict[str, Any], key: str, line_no: int) -> str:
    text = str(row.get(key, "") or "").strip()
    if not text:
        raise AuditError(f"reservation blocks CSV line {line_no}: missing {key}")
    return text


def _require_optional_text(row: Dict[str, Any], key: str, line_no: int) -> Optional[str]:
    text = _require_text(row, key, line_no)
    return text or None


def _parse_positive_int(value: Any, key: str, line_no: int) -> int:
    text = str(value or "").strip()
    if not text:
        raise AuditError(f"reservation blocks CSV line {line_no}: missing {key}")
    try:
        parsed = int(text)
    except ValueError as exc:
        raise AuditError(
            f"reservation blocks CSV line {line_no}: invalid integer for {key}={text!r}"
        ) from exc
    if parsed <= 0:
        raise AuditError(
            f"reservation blocks CSV line {line_no}: {key} must be positive"
        )
    return parsed


def _parse_optional_int(value: Any, key: str, line_no: int) -> Optional[int]:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError as exc:
        raise AuditError(
            f"reservation blocks CSV line {line_no}: invalid integer for {key}={text!r}"
        ) from exc


def _parse_required_iso_date(row: Dict[str, Any], key: str, line_no: int) -> dt.date:
    text = str(row.get(key, "") or "").strip()
    if not text:
        raise AuditError(f"reservation blocks CSV line {line_no}: missing {key}")
    parsed = try_parse_iso_date(text)
    if parsed is None:
        raise AuditError(
            f"reservation blocks CSV line {line_no}: invalid ISO date for {key}={text!r}"
        )
    return parsed
