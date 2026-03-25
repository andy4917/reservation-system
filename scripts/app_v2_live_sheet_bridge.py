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

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from reservation_sheet_audit import get_access_token
from src.domain.report_policy import OrderlistPolicy
from src.domain.sheet_domain import AuditError, extract_sheet_id, infer_year_from_sheet_name, normalize_text
from src.io.sheet_loader import load_sheet_matrix_and_dates
from src.io.sheets_api import GoogleSheetsReadonlyClient
from src.report.ops_workflow import build_ops_artifacts, write_ops_outputs
from src.scan.sheet_scan import extract_reservation_blocks, map_room_rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="app_v2 live sheet read bridge")
    sub = parser.add_subparsers(dest="command", required=True)

    shared = argparse.ArgumentParser(add_help=False)
    shared.add_argument("--spreadsheet", required=True)
    shared.add_argument("--sheet-name", action="append", dest="sheet_names", default=[])
    shared.add_argument("--branch", required=True)
    shared.add_argument("--start-date", required=True)
    shared.add_argument("--end-date", required=True)
    shared.add_argument("--start-row", type=int, default=1)
    shared.add_argument("--year", type=int, default=2026)
    shared.add_argument("--token-file", default=".google_oauth_token.json")
    shared.add_argument("--access-token", default="")

    sheet_read = sub.add_parser("sheet-read", parents=[shared])
    sheet_read.set_defaults(handler=command_sheet_read)

    ops_preview = sub.add_parser("ops-preview", parents=[shared])
    ops_preview.add_argument("--out-dir", required=True)
    ops_preview.add_argument("--exclude-room-makeup", action="store_true")
    ops_preview.add_argument("--flag-continuation-candidates", action="store_true")
    ops_preview.set_defaults(handler=command_ops_preview)
    return parser.parse_args()


def overlaps_window(block: Any, start_date: dt.date, end_date: dt.date) -> bool:
    if not getattr(block, "checkin", None) or not getattr(block, "checkout", None):
      return False
    return bool(block.checkin <= end_date and block.checkout >= start_date)


def build_client(args: argparse.Namespace) -> tuple[GoogleSheetsReadonlyClient, str]:
    spreadsheet_id = extract_sheet_id(args.spreadsheet)
    if not spreadsheet_id:
        raise AuditError(f"Invalid spreadsheet ID/URL: {args.spreadsheet}")
    access_token = get_access_token(args)
    return GoogleSheetsReadonlyClient(access_token=access_token), spreadsheet_id


def load_sheet_blocks(args: argparse.Namespace) -> Dict[str, Any]:
    client, spreadsheet_id = build_client(args)
    start_date = dt.date.fromisoformat(args.start_date)
    end_date = dt.date.fromisoformat(args.end_date)
    all_blocks: List[Any] = []
    items: List[Dict[str, str]] = []
    evidence: List[str] = []
    seen_titles = set()
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
        window_blocks = [block for block in branch_blocks if overlaps_window(block, start_date, end_date)]
        all_blocks.extend(branch_blocks)
        title = clean_sheet_name
        if title not in seen_titles:
            items.append(
                {
                    "id": f"{args.branch}:{clean_sheet_name}",
                    "title": clean_sheet_name,
                    "subtitle": f"예약 {len(window_blocks)}건 / 객실 {len(room_rows)}개",
                    "statusLabel": "LIVE",
                }
            )
            seen_titles.add(title)
        evidence.extend(
            [
                f"sheet:{clean_sheet_name}",
                f"dateCols:{len(date_cols)}",
                f"roomRows:{len(room_rows)}",
                f"branchBlocks:{len(branch_blocks)}",
                f"windowBlocks:{len(window_blocks)}",
            ]
        )
    unique_blocks = dedupe_blocks(all_blocks)
    return {
        "spreadsheet_id": spreadsheet_id,
        "blocks": unique_blocks,
        "items": items,
        "evidence": evidence,
    }


def dedupe_blocks(blocks: List[Any]) -> List[Any]:
    deduped: Dict[tuple[str, str, str, str], Any] = {}
    for block in blocks:
        key = (
            normalize_text(getattr(block, "reservation_key", "")),
            normalize_text(getattr(block, "reservation_no", "")),
            getattr(block, "checkin", None).isoformat() if getattr(block, "checkin", None) else "",
            normalize_text(getattr(block, "room_no", "")),
        )
        deduped[key] = block
    return list(deduped.values())


def iso_or_empty(value: Any) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value or "")


def build_note_head(block: Any) -> str:
    raw = str(getattr(block, "note", "") or "").strip()
    if not raw:
        return ""
    return raw.splitlines()[0].strip()


def build_review_text(block: Any) -> str:
    return " | ".join(
        [
            normalize_text(getattr(block, "guest_name", "")),
            normalize_text(getattr(block, "reservation_no", "")),
            normalize_text(getattr(block, "reservation_key", "")),
            normalize_text(getattr(block, "room_no", "")),
            iso_or_empty(getattr(block, "checkin", None)),
            iso_or_empty(getattr(block, "checkout", None)),
            normalize_text(build_note_head(block)),
        ]
    )


def build_review_candidates(blocks: List[Any]) -> List[Dict[str, str]]:
    by_room: Dict[str, List[Any]] = {}
    for block in blocks:
        room_no = normalize_text(getattr(block, "room_no", ""))
        if not room_no:
            continue
        by_room.setdefault(room_no, []).append(block)

    review_candidates: List[Dict[str, str]] = []
    seen_pairs = set()
    for room_no, room_blocks in by_room.items():
        room_blocks.sort(
            key=lambda item: (
                iso_or_empty(getattr(item, "checkin", None)),
                iso_or_empty(getattr(item, "checkout", None)),
                normalize_text(getattr(item, "reservation_no", "")),
            )
        )
        for left, right in zip(room_blocks, room_blocks[1:]):
            left_checkout = getattr(left, "checkout", None)
            right_checkin = getattr(right, "checkin", None)
            gap_days = None
            if left_checkout and right_checkin:
                gap_days = (right_checkin - left_checkout).days
            left_guest = normalize_text(getattr(left, "guest_name", ""))
            right_guest = normalize_text(getattr(right, "guest_name", ""))
            left_note_head = normalize_text(build_note_head(left))
            right_note_head = normalize_text(build_note_head(right))

            bases: List[str] = []
            if gap_days is not None and gap_days <= 1:
                bases.append("adjacent_stay")
            if left_guest and left_guest == right_guest:
                bases.append("guest_name")
            if left_note_head and right_note_head and left_note_head == right_note_head:
                bases.append("note_head")
            if not normalize_text(getattr(left, "reservation_no", "")) or not normalize_text(getattr(right, "reservation_no", "")):
                bases.append("reservation_no_missing")

            if not bases:
                continue

            pair_id = (
                room_no,
                iso_or_empty(getattr(left, "checkin", None)),
                iso_or_empty(getattr(right, "checkin", None)),
            )
            if pair_id in seen_pairs:
                continue
            seen_pairs.add(pair_id)
            review_candidates.append(
                {
                    "id": f"{room_no}:{pair_id[1]}:{pair_id[2]}",
                    "roomNo": room_no,
                    "date": pair_id[1] or pair_id[2],
                    "basis": ",".join(bases),
                    "leftText": build_review_text(left),
                    "rightText": build_review_text(right),
                    "leftSummary": " / ".join(
                        [
                            normalize_text(getattr(left, "guest_name", "")) or room_no,
                            iso_or_empty(getattr(left, "checkin", None)),
                            normalize_text(build_note_head(left)) or "-",
                        ]
                    ),
                    "rightSummary": " / ".join(
                        [
                            normalize_text(getattr(right, "guest_name", "")) or room_no,
                            iso_or_empty(getattr(right, "checkin", None)),
                            normalize_text(build_note_head(right)) or "-",
                        ]
                    ),
                }
            )
    return review_candidates[:8]


def command_sheet_read(args: argparse.Namespace) -> int:
    payload = load_sheet_blocks(args)
    start_date = dt.date.fromisoformat(args.start_date)
    end_date = dt.date.fromisoformat(args.end_date)
    window_blocks = [block for block in payload["blocks"] if overlaps_window(block, start_date, end_date)]
    review_candidates = build_review_candidates(window_blocks)
    print(
        json.dumps(
            {
                "mode": "sheet-read",
                "branch": args.branch,
                "spreadsheetId": payload["spreadsheet_id"],
                "sheetNames": args.sheet_names,
                "checkedAt": dt.datetime.now().isoformat(),
                "recordsImported": len(window_blocks),
                "summary": f"{args.branch} 예약 시트 라이브 데이터를 읽었습니다.",
                "items": payload["items"][:8],
                "reviewCandidates": review_candidates,
                "evidence": payload["evidence"] + [f"reviewCandidates:{len(review_candidates)}"],
            },
            ensure_ascii=False,
        )
    )
    return 0


def command_ops_preview(args: argparse.Namespace) -> int:
    payload = load_sheet_blocks(args)
    orderlist_policy = OrderlistPolicy(exclude_room_makeup=bool(args.exclude_room_makeup))
    artifacts = build_ops_artifacts(
        payload["blocks"],
        report_start=args.start_date,
        report_end=args.end_date,
        orderlist_policy=orderlist_policy,
    )
    out_dir = Path(args.out_dir)
    write_ops_outputs(out_dir, artifacts)
    continuation_candidates = [
        {
            "id": f"{row.get('date', '')}:{row.get('room_no', '')}",
            "date": row.get("date", ""),
            "roomNo": row.get("room_no", ""),
            "basis": row.get("continuation_basis", ""),
            "departureText": row.get("departure_reservation_nos", ""),
            "arrivalText": row.get("arrival_reservation_nos", ""),
            "noteHead": row.get("note_head", ""),
        }
        for row in artifacts["arrival_artifact"]["rows"]
        if row.get("continuation_candidate") == "Y"
    ]
    print(
        json.dumps(
            {
                "mode": "ops-preview",
                "branch": args.branch,
                "spreadsheetId": payload["spreadsheet_id"],
                "sheetNames": args.sheet_names,
                "checkedAt": dt.datetime.now().isoformat(),
                "reservationBlocks": len(payload["blocks"]),
                "orderlistRows": len(artifacts["orderlist_artifact"]["rows"]),
                "arrivalRows": len(artifacts["arrival_artifact"]["rows"]),
                "continuationCandidates": continuation_candidates,
                "items": payload["items"][:8],
                "evidence": payload["evidence"]
                + [
                    f"excludeRoomMakeup:{'on' if args.exclude_room_makeup else 'off'}",
                    f"continuationCandidates:{len(continuation_candidates)}",
                ],
            },
            ensure_ascii=False,
        )
    )
    return 0


def main() -> int:
    args = parse_args()
    try:
        return int(args.handler(args))
    except AuditError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
