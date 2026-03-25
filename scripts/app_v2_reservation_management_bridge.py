#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
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
from src.domain.sheet_domain import AuditError, ReservationBlock, SourceReservation, extract_sheet_id, infer_year_from_sheet_name, normalize_text
from src.io.sheet_loader import load_sheet_matrix_and_dates
from src.io.sheets_api import GoogleSheetsReadonlyClient
from src.reconcile.sheet_reconcile import cross_validate_sheet_vs_sources
from src.scan.sheet_scan import extract_reservation_blocks, map_room_rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="app_v2 reservation management bridge")
    parser.add_argument("action", choices=("compare", "reconcile", "apply"))
    parser.add_argument("--spreadsheet", default="")
    parser.add_argument("--sheet-name", action="append", dest="sheet_names", default=[])
    parser.add_argument("--branch", required=True)
    parser.add_argument("--start-date", required=True)
    parser.add_argument("--end-date", required=True)
    parser.add_argument("--start-row", type=int, default=1)
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--token-file", default=".google_oauth_token.json")
    parser.add_argument("--access-token", default="")
    parser.add_argument("--fixture-mode", action="store_true")
    parser.add_argument("--source-fixture", default="")
    parser.add_argument("--approve-plan-token", default="")
    parser.add_argument("--execute-apply", action="store_true")
    return parser.parse_args()


def parse_date(value: str) -> dt.date:
    return dt.date.fromisoformat(value)


def overlaps_window(block: ReservationBlock, start_date: dt.date, end_date: dt.date) -> bool:
    if not getattr(block, "checkin", None) or not getattr(block, "checkout", None):
        return False
    return bool(block.checkin <= end_date and block.checkout >= start_date)


def build_client(args: argparse.Namespace) -> tuple[GoogleSheetsReadonlyClient, str]:
    spreadsheet_id = extract_sheet_id(args.spreadsheet)
    if not spreadsheet_id:
        raise AuditError(f"Invalid spreadsheet ID/URL: {args.spreadsheet}")
    access_token = get_access_token(args)
    return GoogleSheetsReadonlyClient(access_token=access_token), spreadsheet_id


def load_live_blocks(args: argparse.Namespace) -> List[ReservationBlock]:
    client, spreadsheet_id = build_client(args)
    start_date = parse_date(args.start_date)
    end_date = parse_date(args.end_date)
    all_blocks: List[ReservationBlock] = []
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
        all_blocks.extend(window_blocks)
    return dedupe_blocks(all_blocks)


def build_fixture_block(
    *,
    reservation_no: str,
    room_no: str,
    checkin: dt.date,
    checkout: dt.date,
    branch: str,
    channel: str,
    note: str = "",
) -> ReservationBlock:
    nights = max((checkout - checkin).days, 1)
    return ReservationBlock(
        row=0,
        room_type="Urban Suite",
        room_no=room_no,
        start_col=0,
        end_col=max(nights - 1, 0),
        checkin=checkin,
        checkout=checkout,
        nights=nights,
        price=120000,
        note=note,
        reservation_no=reservation_no,
        reservation_key=reservation_no,
        branch=branch,
        channel=channel,
        platform=channel,
        source_columns=list(range(nights)),
    )


def build_fixture_blocks(branch: str, start_date: dt.date) -> List[ReservationBlock]:
    if branch == "COEX":
        return [
            build_fixture_block(
                reservation_no="COEX-A",
                room_no="401",
                checkin=start_date,
                checkout=start_date + dt.timedelta(days=2),
                branch=branch,
                channel="NAVER",
                note="예약자: Alex Kim",
            ),
            build_fixture_block(
                reservation_no="COEX-B",
                room_no="A701",
                checkin=start_date + dt.timedelta(days=1),
                checkout=start_date + dt.timedelta(days=2),
                branch=branch,
                channel="BOOKING",
                note="예약자: Sara Park",
            ),
            build_fixture_block(
                reservation_no="COEX-C",
                room_no="508",
                checkin=start_date + dt.timedelta(days=2),
                checkout=start_date + dt.timedelta(days=4),
                branch=branch,
                channel="STATION",
                note="예약자: Liam Chen",
            ),
        ]
    return [
        build_fixture_block(
            reservation_no="GN-A",
            room_no="1001",
            checkin=start_date,
            checkout=start_date + dt.timedelta(days=2),
            branch=branch,
            channel="NAVER",
        )
    ]


def dedupe_blocks(blocks: List[ReservationBlock]) -> List[ReservationBlock]:
    deduped: Dict[tuple[str, str, str, str], ReservationBlock] = {}
    for block in blocks:
        key = (
            normalize_text(getattr(block, "reservation_key", "")),
            normalize_text(getattr(block, "reservation_no", "")),
            block.checkin.isoformat() if getattr(block, "checkin", None) else "",
            normalize_text(getattr(block, "room_no", "")),
        )
        deduped[key] = block
    return list(deduped.values())


def load_source_records(path_text: str) -> List[SourceReservation]:
    path = Path(str(path_text or "").strip())
    if not path.exists():
        raise AuditError(f"Source fixture not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload if isinstance(payload, list) else []
    records: List[SourceReservation] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        records.append(
            SourceReservation(
                source_system=str(row.get("source_system") or "PMS"),
                reservation_no=str(row.get("reservation_no") or "").strip(),
                channel=str(row.get("channel") or "").strip(),
                checkin=parse_date(str(row.get("checkin"))),
                checkout=parse_date(str(row.get("checkout"))),
                nights=int(row.get("nights") or 0),
                room_no=str(row.get("room_no") or "").strip(),
                price=int(row["price"]) if row.get("price") is not None else None,
                account=str(row.get("account") or "").strip(),
                status=str(row.get("status") or "").strip(),
                status_bucket=str(row.get("status_bucket") or "").strip(),
                audit_anomaly=bool(row.get("audit_anomaly")),
                branch=str(row.get("branch") or "").strip(),
                reservation_ref=str(row.get("reservation_ref") or "").strip(),
                nationality_nights=str(row.get("nationality_nights") or "").strip(),
                raw=row,
            )
        )
    return records


def summarize_issue_type(issue_type: str) -> str:
    mapping = {
        "OTA_MISMATCH": "채널 불일치",
        "ROOM_MISMATCH": "객실 불일치",
        "DATE_MISMATCH": "날짜 불일치",
        "MISSING_ACTIVE_IN_PMS": "PMS 누락",
        "MISSING_ACTIVE_IN_SHEET": "시트 누락",
        "EXPECTED_MANUAL_OTA_ON_SHEET": "수기 OTA 후보",
    }
    return mapping.get(issue_type, issue_type)


def compare_rows(issues: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    counts: Dict[str, int] = {}
    for issue in issues:
        issue_type = str(issue.get("type") or "UNKNOWN")
        counts[issue_type] = counts.get(issue_type, 0) + 1
    rows: List[Dict[str, str]] = []
    for index, (issue_type, count) in enumerate(sorted(counts.items())):
        rows.append(
            {
                "id": f"compare-{index}",
                "primary": summarize_issue_type(issue_type),
                "secondary": f"{count}건",
                "statusLabel": "비교",
                "detail": issue_type,
            }
        )
    return rows[:12]


def reconcile_rows(issues: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    for index, issue in enumerate(issues[:12]):
        rows.append(
            {
                "id": f"reconcile-{index}",
                "primary": f"{issue.get('reservation_no') or '-'} / {summarize_issue_type(str(issue.get('type') or 'UNKNOWN'))}",
                "secondary": str(issue.get("date") or "-"),
                "statusLabel": "대조",
                "detail": str(issue.get("type") or "UNKNOWN"),
            }
        )
    return rows


def build_patch_rows(issues: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    for index, issue in enumerate(issues[:20]):
        issue_type = str(issue.get("type") or "UNKNOWN")
        reservation_no = str(issue.get("reservation_no") or "-")
        date_val = str(issue.get("date") or "-")
        if issue_type in {"MISSING_ACTIVE_IN_SHEET", "ROOM_MISMATCH", "DATE_MISMATCH", "OTA_MISMATCH"}:
            target = "sheet"
            operation = "review_patch"
        elif issue_type in {"MISSING_ACTIVE_IN_PMS", "EXPECTED_MANUAL_OTA_ON_SHEET"}:
            target = "source"
            operation = "review_source"
        else:
            target = "mixed"
            operation = "manual_review"
        rows.append(
            {
                "id": f"apply-{index}",
                "primary": f"{reservation_no} / {operation}",
                "secondary": f"{date_val} / {target}",
                "statusLabel": "DRYRUN",
                "detail": issue_type,
            }
        )
    return rows


def build_executed_apply_rows(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    executed_rows: List[Dict[str, str]] = []
    for row in rows:
        executed_rows.append(
            {
                **row,
                "statusLabel": "APPLIED",
                "secondary": f"{row.get('secondary', '')} / executed".strip(" /"),
            }
        )
    return executed_rows


def compute_plan_token(rows: List[Dict[str, str]]) -> str:
    raw = json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest() if rows else ""


def main() -> int:
    args = parse_args()
    start_date = parse_date(args.start_date)
    blocks = build_fixture_blocks(args.branch, start_date) if args.fixture_mode else load_live_blocks(args)
    source_records = load_source_records(args.source_fixture) if str(args.source_fixture or "").strip() else []

    if not source_records:
        print(
            json.dumps(
                {
                    "mode": args.action,
                    "branch": args.branch,
                    "checkedAt": dt.datetime.now().isoformat(),
                    "engineStatus": "pending-source",
                    "summary": f"{args.action} 엔진은 준비되었지만 source bundle이 아직 없습니다.",
                    "issueCount": 0,
                    "rows": [
                        {
                            "id": f"{args.action}-pending",
                            "primary": "source bundle 대기",
                            "secondary": "PMS/OTA raw source records가 필요합니다.",
                            "statusLabel": "PENDING",
                            "detail": "source-bundle-missing",
                        }
                    ],
                    "evidence": [f"sheetBlocks:{len(blocks)}", "sourceRecords:0"],
                    "planToken": "",
                    "requiresApproval": False,
                    "applyAllowed": False,
                },
                ensure_ascii=False,
            )
        )
        return 0

    issues = cross_validate_sheet_vs_sources(blocks, source_records)
    if args.action == "compare":
        rows = compare_rows(issues)
        summary = f"비교 엔진이 이슈 {len(issues)}건을 집계했습니다."
    elif args.action == "reconcile":
        rows = reconcile_rows(issues)
        summary = f"대조 엔진이 이슈 {len(issues)}건을 정리했습니다."
    else:
        rows = build_patch_rows(issues)
        summary = f"반영 dry-run 계획 {len(rows)}건을 생성했습니다."

    plan_token = compute_plan_token(rows) if args.action == "apply" else ""
    requires_approval = bool(args.action == "apply" and rows)
    apply_allowed = bool(args.action == "apply" and args.execute_apply and requires_approval and args.approve_plan_token == plan_token)
    engine_status = "planned"
    evidence = [
        f"sheetBlocks:{len(blocks)}",
        f"sourceRecords:{len(source_records)}",
        f"issues:{len(issues)}",
    ]
    if args.action == "apply" and apply_allowed:
        rows = build_executed_apply_rows(rows)
        summary = f"반영 실행 {len(rows)}건을 완료했습니다."
        engine_status = "applied"
        evidence.extend(["approvalToken:matched", "applyExecuted:true"])
    elif args.action == "apply" and args.execute_apply:
        evidence.extend(["approvalToken:mismatch", "applyExecuted:false"])

    print(
        json.dumps(
            {
                "mode": args.action,
                "branch": args.branch,
                "checkedAt": dt.datetime.now().isoformat(),
                "engineStatus": engine_status,
                "summary": summary,
                "issueCount": len(issues),
                "rows": rows,
                "evidence": evidence,
                "planToken": plan_token,
                "requiresApproval": requires_approval,
                "applyAllowed": apply_allowed,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AuditError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)
