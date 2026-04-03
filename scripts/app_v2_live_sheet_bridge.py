#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_audit import get_access_token
from rapidfuzz import fuzz, process, utils
from src.domain.report_policy import OrderlistPolicy
from src.domain.sheet_domain import AuditError, extract_sheet_id, infer_year_from_sheet_name, normalize_text
from src.io.sheet_loader import load_sheet_matrix_and_dates
from src.io.sheets_api import GoogleSheetsReadonlyClient
from src.report.ops_workflow import build_ops_artifacts, write_ops_outputs
from src.scan.sheet_scan import extract_reservation_blocks, map_room_rows

CHANNEL_PATTERN = re.compile(r"\[CHANNEL:\s*([^\]]+)\]")
RESERVATION_NO_PATTERN = re.compile(r"예약번호\s*:\s*([A-Za-z0-9-]+)")
GUEST_NAME_PATTERN = re.compile(r"예약자\s*:\s*([^\n|]+)")
PHONE_PATTERN = re.compile(r"연락처\s*:\s*([+0-9()\-\s]+)")
FEATURE_KEYS = [
    "same_room",
    "same_room_alias",
    "same_reservation_no",
    "same_guest_name",
    "guest_name_similarity",
    "same_phone",
    "same_channel",
    "same_note_signature",
    "note_head_similarity",
    "package_marker_match",
    "room_change_blocker",
    "branch_match",
]
CONTRADICTION_FLAG_KEYS = [
    "room_change_blocker",
    "date_gap_conflict",
    "identity_conflict",
    "identity_gap_conflict",
    "channel_conflict",
]


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
    shared.add_argument("--year", type=int, default=dt.date.today().year)
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


def normalize_phone(text: Any) -> str:
    digits = "".join(ch for ch in str(text or "") if ch.isdigit())
    if len(digits) >= 8:
        return digits[-11:]
    return digits


def extract_channel_marker(text: Any) -> str:
    raw = normalize_text(text)
    match = CHANNEL_PATTERN.search(raw)
    if match:
        return normalize_text(match.group(1)).upper()
    return ""


def extract_reservation_no_from_text(text: Any) -> str:
    raw = normalize_text(text)
    match = RESERVATION_NO_PATTERN.search(raw)
    if match:
        return normalize_text(match.group(1))
    return ""


def extract_guest_name(text: Any) -> str:
    raw = normalize_text(text)
    match = GUEST_NAME_PATTERN.search(raw)
    if match:
        value = match.group(1).split("국적")[0].split("연락처")[0].strip()
        return normalize_text(value)
    return ""


def extract_phone_from_text(text: Any) -> str:
    raw = normalize_text(text)
    match = PHONE_PATTERN.search(raw)
    if match:
        return normalize_phone(match.group(1))
    return normalize_phone(raw)


def extract_package_markers(text: Any) -> List[str]:
    raw = normalize_text(text).lower()
    markers: List[str] = []
    for label, token in (
        ("package", "패키지"),
        ("wellness", "웰니스"),
        ("headspa", "헤드스파"),
        ("continuation", "연박"),
        ("room_change_blocker", "방 변경x"),
        ("room_change_blocker_compact", "방변경x"),
    ):
        if token in raw:
            markers.append(label)
    return sorted(set(markers))


def has_room_change_blocker(text: Any) -> bool:
    raw = normalize_text(text).lower()
    return "방 변경x" in raw or "방변경x" in raw or "room change" in raw


def build_note_signature(text: Any) -> str:
    raw = normalize_text(text).lower()
    normalized = re.sub(r"[0-9]", "", raw)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    normalized = normalized.replace("예약번호 :", "").replace("예약자 :", "").replace("연락처 :", "")
    return normalized[:120]


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


def normalize_search_key(text: Any) -> str:
    normalized = utils.default_process(normalize_text(text))
    return normalized if isinstance(normalized, str) else ""


def attach_fuzzy_candidate_ids(bundles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    guest_choices = {
        bundle["id"]: bundle["guestNameSearchKey"]
        for bundle in bundles
        if normalize_text(bundle.get("guestNameSearchKey", ""))
    }
    note_choices = {
        bundle["id"]: bundle["noteHeadSearchKey"]
        for bundle in bundles
        if len(normalize_text(bundle.get("noteHeadSearchKey", ""))) >= 8
    }

    for bundle in bundles:
        guest_key = normalize_text(bundle.get("guestNameSearchKey", ""))
        note_key = normalize_text(bundle.get("noteHeadSearchKey", ""))

        guest_matches = process.extract(
            guest_key,
            guest_choices,
            scorer=fuzz.WRatio,
            limit=5,
            score_cutoff=88,
        ) if guest_key else []
        note_matches = process.extract(
            note_key,
            note_choices,
            scorer=fuzz.WRatio,
            limit=5,
            score_cutoff=85,
        ) if note_key else []

        bundle["fuzzyGuestMatchIds"] = [
            match_id for match_id, _score, _value in guest_matches if match_id != bundle["id"]
        ]
        bundle["fuzzyNoteMatchIds"] = [
            match_id for match_id, _score, _value in note_matches if match_id != bundle["id"]
        ]
    return bundles


def build_search_bundles(blocks: List[Any]) -> List[Dict[str, Any]]:
    bundles: List[Dict[str, Any]] = []
    for block in blocks:
        note_head = normalize_text(build_note_head(block))
        reservation_no = normalize_text(getattr(block, "reservation_no", "")) or extract_reservation_no_from_text(note_head)
        guest_name = normalize_text(getattr(block, "guest_name", "")) or extract_guest_name(note_head)
        guest_name_search_key = normalize_search_key(guest_name)
        note_head_search_key = normalize_search_key(note_head)
        bundles.append(
            {
                "id": f"{normalize_text(getattr(block, 'room_no', ''))}:{iso_or_empty(getattr(block, 'checkin', None))}:{reservation_no or normalize_text(getattr(block, 'reservation_key', ''))}",
                "branch": normalize_text(getattr(block, "branch", "")),
                "roomNo": normalize_text(getattr(block, "room_no", "")),
                "reservationNo": reservation_no,
                "reservationKey": normalize_text(getattr(block, "reservation_key", "")),
                "guestName": guest_name,
                "phone": extract_phone_from_text(note_head),
                "channel": normalize_text(getattr(block, "channel", "")) or extract_channel_marker(note_head),
                "checkin": iso_or_empty(getattr(block, "checkin", None)),
                "checkout": iso_or_empty(getattr(block, "checkout", None)),
                "nightCount": getattr(block, "nights", 0) or 0,
                "noteHead": note_head,
                "noteSignature": build_note_signature(note_head),
                "guestNameSearchKey": guest_name_search_key,
                "noteHeadSearchKey": note_head_search_key,
                "packageMarkers": extract_package_markers(note_head),
                "roomChangeBlocker": has_room_change_blocker(note_head),
                "fuzzyGuestMatchIds": [],
                "fuzzyNoteMatchIds": [],
            }
        )
    return attach_fuzzy_candidate_ids(bundles)


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
    search_bundles = build_search_bundles(window_blocks)
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
                "searchBundles": search_bundles,
                "candidateFeatures": FEATURE_KEYS,
                "contradictionFlags": CONTRADICTION_FLAG_KEYS,
                "evidence": payload["evidence"] + [f"reviewCandidates:{len(review_candidates)}"],
            },
            ensure_ascii=False,
        )
    )
    return 0


def command_ops_preview(args: argparse.Namespace) -> int:
    payload = load_sheet_blocks(args)
    start_date = dt.date.fromisoformat(args.start_date)
    end_date = dt.date.fromisoformat(args.end_date)
    window_blocks = [block for block in payload["blocks"] if overlaps_window(block, start_date, end_date)]
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
            "departureReservationNo": normalize_text(row.get("departure_reservation_nos", "")),
            "arrivalReservationNo": normalize_text(row.get("arrival_reservation_nos", "")),
            "sameReservationNo": normalize_text(row.get("departure_reservation_nos", "")) == normalize_text(row.get("arrival_reservation_nos", "")),
            "sameGuestName": False,
            "samePhone": False,
            "departureChannel": extract_channel_marker(row.get("note_head", "").split("|")[-1]),
            "arrivalChannel": extract_channel_marker(row.get("note_head", "").split("|")[0]),
            "noteSignature": build_note_signature(row.get("note_head", "")),
            "packageMarkers": extract_package_markers(row.get("note_head", "")),
            "roomChangeBlocker": has_room_change_blocker(row.get("note_head", "")),
            "candidateFeatures": FEATURE_KEYS,
            "contradictionFlags": ["room_change_blocker"] if has_room_change_blocker(row.get("note_head", "")) else [],
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
                "windowReservationBlocks": len(window_blocks),
                "orderlistRows": len(artifacts["orderlist_artifact"]["rows"]),
                "arrivalRows": len(artifacts["arrival_artifact"]["rows"]),
                "continuationCandidates": continuation_candidates,
                "searchBundles": build_search_bundles(window_blocks),
                "candidateFeatures": FEATURE_KEYS,
                "contradictionFlags": CONTRADICTION_FLAG_KEYS,
                "items": payload["items"][:8],
                "evidence": payload["evidence"]
                + [
                    f"windowReservationBlocks:{len(window_blocks)}",
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
