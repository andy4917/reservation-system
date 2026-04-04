#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_audit import get_access_token
from src.domain.ops_sheet_policy import DEFAULT_OPS_SHEET_SPREADSHEET, normalize_ops_sheet_spreadsheet
from src.domain.report_policy import OrderlistPolicy
from src.domain.sheet_domain import AuditError, extract_sheet_id, infer_year_from_sheet_name, normalize_text
from src.io.sheet_loader import load_sheet_matrix_and_dates
from src.io.sheets_api import GoogleSheetsClient, GoogleSheetsReadonlyClient
from src.report.ops_sheet_export import apply_arrival_packet, apply_orderlist_packets, build_ops_sheet_export_bundle
from src.report.ops_workflow import build_ops_artifacts
from src.scan.sheet_scan import extract_reservation_blocks, map_room_rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply app_v2 ops output to Google Sheets")
    parser.add_argument("--action", choices=["order-list", "arrival"], required=True)
    parser.add_argument("--spreadsheet", required=True)
    parser.add_argument("--sheet-name", action="append", dest="sheet_names", default=[])
    parser.add_argument("--branch", required=True)
    parser.add_argument("--start-date", required=True)
    parser.add_argument("--end-date", required=True)
    parser.add_argument("--report-date", default="")
    parser.add_argument("--start-row", type=int, default=1)
    parser.add_argument("--year", type=int, default=dt.date.today().year)
    parser.add_argument("--token-file", default=".google_oauth_token.json")
    parser.add_argument("--access-token", default="")
    parser.add_argument("--ops-sheet-spreadsheet", default=DEFAULT_OPS_SHEET_SPREADSHEET)
    return parser.parse_args()


def overlaps_window(block: Any, start_date: dt.date, end_date: dt.date) -> bool:
    if not getattr(block, "checkin", None) or not getattr(block, "checkout", None):
        return False
    return bool(block.checkin <= end_date and block.checkout >= start_date)


def build_client(args: argparse.Namespace) -> tuple[GoogleSheetsReadonlyClient, str, str]:
    spreadsheet_id = extract_sheet_id(args.spreadsheet)
    if not spreadsheet_id:
        raise AuditError(f"Invalid spreadsheet ID/URL: {args.spreadsheet}")
    access_token = get_access_token(args)
    return GoogleSheetsReadonlyClient(access_token=access_token), spreadsheet_id, access_token


def load_blocks(args: argparse.Namespace) -> List[Any]:
    client, spreadsheet_id, _ = build_client(args)
    start_date = dt.date.fromisoformat(args.start_date)
    end_date = dt.date.fromisoformat(args.end_date)
    all_blocks: List[Any] = []
    for sheet_name in args.sheet_names:
        clean_sheet_name = normalize_text(sheet_name)
        if not clean_sheet_name:
            continue
        year = infer_year_from_sheet_name(clean_sheet_name, args.year)
        matrix, date_row, date_cols = load_sheet_matrix_and_dates(
            client=client,
            spreadsheet_id=spreadsheet_id,
            sheet_name=clean_sheet_name,
            preferred_start_row=max(int(args.start_row), 1),
            year=year,
        )
        room_rows = map_room_rows(matrix, date_cols, scan_row_start=date_row + 2, room_row_logs=[])
        blocks, _scan_meta = extract_reservation_blocks(matrix, date_cols, room_rows)
        branch_blocks = [
            block
            for block in blocks
            if normalize_text(getattr(block, "branch", "")) == normalize_text(args.branch)
        ]
        all_blocks.extend([block for block in branch_blocks if overlaps_window(block, start_date, end_date)])
    return all_blocks


def filter_rows_by_report_date(rows: List[Dict[str, Any]], report_date: str) -> List[Dict[str, Any]]:
    if not normalize_text(report_date):
        return rows
    return [row for row in rows if normalize_text(row.get("date", "")) == normalize_text(report_date)]


def main() -> int:
    args = parse_args()
    readonly_client, _sheet_id, access_token = build_client(args)
    blocks = load_blocks(args)
    artifacts = build_ops_artifacts(
        blocks,
        report_start=args.start_date,
        report_end=args.end_date,
        client=readonly_client,
        ops_sheet_spreadsheet=args.ops_sheet_spreadsheet,
        orderlist_policy=OrderlistPolicy(),
    )
    bundle = artifacts["ops_sheet_bundle"]
    report_date = normalize_text(args.report_date) or normalize_text(args.start_date)
    writer = GoogleSheetsClient(access_token=access_token)

    if args.action == "order-list":
        filtered_order_rows = filter_rows_by_report_date(artifacts["orderlist_artifact"]["rows"], report_date)
        filtered_bundle = build_ops_sheet_export_bundle(
            filtered_order_rows,
            [],
            client=readonly_client,
            spreadsheet_id=normalize_ops_sheet_spreadsheet(args.ops_sheet_spreadsheet),
        )
        applied = apply_orderlist_packets(
            client=writer,
            spreadsheet_id=filtered_bundle["spreadsheet_id"],
            packets=filtered_bundle["orderlist_packets"],
        )
        print(json.dumps({
            "action": args.action,
            "branch": args.branch,
            "reportDate": report_date,
            "summary": f"오더리스트 {sum(item['row_count'] for item in applied)}행을 시트에 적용했습니다.",
            "appliedCount": sum(item["row_count"] for item in applied),
            "spreadsheetId": filtered_bundle["spreadsheet_id"],
            "targetSheetNames": [item["tab_name"] for item in applied],
            "appliedAt": dt.datetime.now().isoformat(),
        }, ensure_ascii=False))
        return 0

    arrival_packets = [packet for packet in bundle["arrival_packets"] if normalize_text(packet.get("report_date", "")) == report_date]
    if not arrival_packets:
        raise AuditError(f"Arrival packet not found for report_date={report_date}")
    applied_packet = apply_arrival_packet(client=writer, packet=arrival_packets[0])
    print(json.dumps({
        "action": args.action,
        "branch": args.branch,
        "reportDate": report_date,
        "summary": f"어라이벌 보드 {report_date} 데이터를 시트에 적용했습니다.",
        "appliedCount": applied_packet["cell_update_count"],
        "spreadsheetId": applied_packet["spreadsheet_id"],
        "targetSheetNames": [applied_packet["sheet_name"]],
        "appliedAt": dt.datetime.now().isoformat(),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
