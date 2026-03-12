#!/usr/bin/env python
from __future__ import annotations

import sys

# Prevent creating __pycache__ inside the extension folder.
sys.dont_write_bytecode = True

import argparse
import base64
import csv
import datetime as dt
import hashlib
import io
import json
import os
import re
import zipfile
import secrets
import threading
from collections import Counter
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse
import webbrowser

import requests

from src.domain.sheet_domain import (
    ACCOUNT_FIELD_ALIASES,
    BRANCH_FIELD_ALIASES,
    CHANNEL_FIELD_ALIASES,
    CELL_STATUS_VACANT,
    CHECKIN_FIELD_ALIASES,
    CHECKOUT_FIELD_ALIASES,
    DEFAULT_CLIENT_ID,
    DEFAULT_PKCE_FILE,
    DEFAULT_REDIRECT_URI,
    DEFAULT_SCOPE,
    DEFAULT_SHEET_GID,
    DEFAULT_SHEET_ID,
    DEFAULT_SHEET_NAME,
    DEFAULT_START_ROW,
    DEFAULT_TOKEN_FILE,
    NATIONALITY_FIELD_ALIASES,
    NIGHTS_FIELD_ALIASES,
    PRICE_FIELD_ALIASES,
    RES_NO_FIELD_ALIASES,
    ROOM_FIELD_ALIASES,
    ROOM_TYPE_BY_ROOM_NO,
    STATUS_FIELD_ALIASES,
    AuditError,
    BRANCH_SPLIT_ROW,
    HarRecord,
    ReservationBlock,
    SourceReservation,
    extract_sheet_id,
    infer_year_from_sheet_name,
    classify_reservation_status_bucket,
    has_reservation_audit_anomaly,
    normalize_platform_name,
    normalize_room_no_key,
    normalize_reservation_status,
    normalize_text,
    parse_money_to_int,
)
from src.io.har_cache import load_har_entries
from src.io.sheets_api import GoogleSheetsReadonlyClient
from src.io.sheet_loader import load_sheet_matrix_and_dates
from src.scan.sheet_scan import (
    SheetMatrix,
    calculate_channel_recommendations,
    classify_color_cell,
    calculate_vac_by_room_type,
    extract_inventory_values_by_date,
    extract_reservation_blocks,
    find_inventory_rows,
    map_room_rows,
    parse_note_info,
    parse_reservation_identity,
    room_no_alias_keys,
)
from src.reconcile.sheet_reconcile import (
    cross_validate_sheet_vs_sources,
    reconcile_sheet_vs_har,
)
from src.report.ops_workflow import (
    build_ops_artifacts,
    build_ops_summary,
    load_blocks_csv,
    write_ops_outputs,
)
from src.report.sheet_report import (
    col_one_based_to_a1,
    write_blocks_csv,
    write_cross_validation_csv,
    write_daily_csv,
    write_long_tail_ota_candidates_csv,
    write_recommendations_csv,
    write_room_identity_issues_csv,
    write_room_registry_csv,
    write_room_rows_csv,
    write_room_type_vac_csv,
    write_source_reservations_csv,
)

# Compatibility re-exports consumed by reservation_sheet_sync.
_SYNC_COMPAT_EXPORTS = (DEFAULT_START_ROW,)

PROXY_ENV_KEYS = (
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
)

ROOM_REGISTRY_ALLOWED_PATTERNS = (
    re.compile(r"^\d{3,4}$"),
    re.compile(r"^A\d{3,4}$"),
)
ROOM_REGISTRY_BUILDING_MAX_FLOOR = {
    "A": 12,
    "B": 12,
}
ROOM_REGISTRY_BRANCH_BUILDING_MAX_FLOOR = {
    ("BRANCH_THE_SEOLLEUNG", "B"): 13,
}
ROOM_REGISTRY_COMPARE_FIELDS = (
    "branch",
    "building",
    "room_number",
    "sheet_room_no",
    "pms_room_no",
)

def parse_har_records(har_path: Path) -> List[HarRecord]:
    entries = load_har_entries(har_path)
    records: List[HarRecord] = []

    for entry in entries:
        req = entry.get("request", {})
        url = req.get("url", "")
        method = req.get("method", "")
        if "script.google.com" not in url or "/exec" not in url or method != "POST":
            continue
        post_data = req.get("postData", {})
        text = post_data.get("text", "")
        if not text:
            continue
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            continue
        info_text = payload.get("info", "") or ""
        note_info = parse_note_info(info_text)
        ota_raw = payload.get("ota", "")
        ota_norm = normalize_platform_name(ota_raw)
        record = HarRecord(
            reservation_no=note_info.reservation_no,
            ota=normalize_text(ota_raw),
            ota_normalized=ota_norm,
            price=parse_money_to_int(str(payload.get("price", ""))),
            nights=to_int(payload.get("nights")),
            checkin=note_info.stay_checkin,
            checkout=note_info.stay_checkout,
            info=info_text,
            raw=payload,
        )
        records.append(record)

    return records


def parse_source_reservations_from_har(
    har_path: Path,
    *,
    pms_branch_map: Optional[Dict[str, str]] = None,
) -> List[SourceReservation]:
    entries = load_har_entries(har_path)
    records: List[SourceReservation] = []

    for entry in entries:
        req = entry.get("request", {})
        res = entry.get("response", {})
        url = req.get("url", "")
        host = ""
        host_m = re.match(r"https?://([^/]+)", url)
        if host_m:
            host = host_m.group(1).lower()

        payload_candidates: List[Any] = []
        req_text = (req.get("postData", {}) or {}).get("text", "")
        res_text = (res.get("content", {}) or {}).get("text", "")
        for text in (req_text, res_text):
            parsed_json = try_parse_json_text(text)
            if parsed_json is not None:
                payload_candidates.append(parsed_json)

        source_system = "HAR"
        if "wings" in host:
            source_system = "WINGS"
        elif "naver" in host:
            source_system = "NAVER"
        elif "station" in host:
            source_system = "STATION"
        elif "script.google.com" in host:
            source_system = "WINGS"

        for payload in payload_candidates:
            for obj in iter_json_objects(payload):
                parsed = parse_source_row(
                    obj,
                    source_system=source_system,
                    pms_branch_map=pms_branch_map,
                )
                if parsed:
                    records.append(parsed)

    deduped: Dict[Tuple[str, dt.date, dt.date, str, str], SourceReservation] = {}
    for record in records:
        key = (
            record.reservation_no,
            record.checkin,
            record.checkout,
            record.channel,
            record.source_system,
        )
        deduped[key] = record
    return list(deduped.values())


def build_har_index(records: List[HarRecord]) -> Dict[str, HarRecord]:
    result: Dict[str, HarRecord] = {}
    for record in records:
        if record.reservation_no:
            result[record.reservation_no] = record
    return result


def load_source_reservations(
    har_path: str,
    wings_file: str,
    naver_file: str,
    station_file: str,
    pms_file: str,
    pms_branch_map: Optional[Dict[str, str]] = None,
) -> List[SourceReservation]:
    records: List[SourceReservation] = []

    if har_path:
        path = Path(har_path)
        if path.exists():
            source_records, har_records = load_har_reservation_data(
                path,
                pms_branch_map=pms_branch_map,
            )
            records.extend(source_records)
            for hr in har_records:
                if not hr.reservation_no or not hr.checkin:
                    continue
                checkin, checkout, nights = calculate_checkout_from_dates(
                    hr.checkin, hr.checkout, hr.nights
                )
                if not checkin or not checkout or nights <= 0:
                    continue
                records.append(
                    SourceReservation(
                        source_system="HAR_SCRIPT",
                        reservation_no=hr.reservation_no,
                        channel=normalize_channel(hr.ota_normalized, "HAR_SCRIPT"),
                        checkin=checkin,
                        checkout=checkout,
                        nights=nights,
                        price=hr.price,
                        raw=hr.raw,
                    )
                )

    def _split_file_inputs(raw_value: str) -> List[str]:
        text = normalize_text(raw_value)
        if not text:
            return []
        return [normalize_text(part) for part in re.split(r"[\n,]+", text) if normalize_text(part)]

    source_inputs: List[Tuple[str, str, str]] = [
        (path, "WINGS", "") for path in _split_file_inputs(wings_file)
    ] + [
        (path, "NAVER", "NAVER") for path in _split_file_inputs(naver_file)
    ] + [
        (path, "STATION", "STATION") for path in _split_file_inputs(station_file)
    ] + [
        (path, "PMS", "") for path in _split_file_inputs(pms_file)
    ]

    for file_path, source_system, default_channel in source_inputs:
        path = Path(file_path)
        if not path.exists():
            raise AuditError(f"{source_system} ?뚯씪??李얠? 紐삵뻽?듬땲?? {path}")
        if path.suffix.lower() == ".har":
            har_records = parse_source_reservations_from_har(
                path,
                pms_branch_map=pms_branch_map,
            )
            if source_system:
                for record in har_records:
                    record.source_system = source_system
            records.extend(har_records)
            continue
        records.extend(
            parse_source_file(
                path,
                source_system,
                default_channel,
                pms_branch_map=pms_branch_map,
            )
        )

    deduped: Dict[Tuple[str, dt.date, dt.date, str, str], SourceReservation] = {}
    for record in records:
        key = (
            record.reservation_no,
            record.checkin,
            record.checkout,
            record.channel,
            record.source_system,
        )
        deduped[key] = record
    return list(deduped.values())


@lru_cache(maxsize=32)
def _cached_har_reservation_data(
    path_text: str,
    branch_items: Tuple[Tuple[str, str], ...],
) -> Tuple[List[SourceReservation], List[HarRecord]]:
    path = Path(path_text)
    branch_map = dict(branch_items)
    source_records = parse_source_reservations_from_har(
        path,
        pms_branch_map=branch_map or None,
    )
    har_records = parse_har_records(path)
    return source_records, har_records


def load_har_reservation_data(
    har_path: Path,
    *,
    pms_branch_map: Optional[Dict[str, str]] = None,
) -> Tuple[List[SourceReservation], List[HarRecord]]:
    branch_items = tuple(sorted((pms_branch_map or {}).items()))
    source_records, har_records = _cached_har_reservation_data(
        str(har_path.resolve()),
        branch_items,
    )
    return list(source_records), list(har_records)


def enrich_blocks_with_source_metadata(
    blocks: List[ReservationBlock],
    source_records: List[SourceReservation],
) -> None:
    by_reservation_no: Dict[str, List[SourceReservation]] = {}
    for record in source_records:
        key = normalize_text(record.reservation_no)
        if not key:
            continue
        by_reservation_no.setdefault(key, []).append(record)
    for block in blocks:
        if normalize_text(block.nationality_nights):
            continue
        reservation_no = normalize_text(block.reservation_no)
        if not reservation_no:
            continue
        for record in by_reservation_no.get(reservation_no, []):
            nationality_nights = normalize_text(record.nationality_nights)
            if nationality_nights:
                block.nationality_nights = nationality_nights
                break


def enrich_long_tail_candidates_with_source_records(
    candidates: List[Dict[str, Any]],
    source_records: List[SourceReservation],
) -> List[Dict[str, Any]]:
    by_reservation_no: Dict[str, List[Tuple[str, SourceReservation]]] = {}
    for record in source_records:
        reservation_no = normalize_text(record.reservation_no)
        if reservation_no:
            by_reservation_no.setdefault(reservation_no, []).append(("reservation_no", record))
        reservation_ref = normalize_text(record.reservation_ref)
        if reservation_ref:
            by_reservation_no.setdefault(reservation_ref, []).append(("reservation_ref", record))

    enriched: List[Dict[str, Any]] = []
    for item in candidates or []:
        row = dict(item)
        if normalize_text(row.get("candidate_channel")):
            enriched.append(row)
            continue

        reservation_hint = normalize_text(row.get("reservation_no"))
        if not reservation_hint:
            reservation_hint = normalize_text(parse_reservation_identity(str(row.get("note_head", ""))).get("reservation_no", ""))
        if not reservation_hint:
            enriched.append(row)
            continue

        date_val = parse_any_date(row.get("date"))
        room_no = normalize_text(row.get("room_no"))
        matched: List[Tuple[str, SourceReservation]] = []
        for basis, record in by_reservation_no.get(reservation_hint, []):
            if date_val and not (record.checkin <= date_val < record.checkout):
                continue
            record_room_no = normalize_text(record.room_no)
            if room_no and record_room_no and record_room_no != room_no:
                continue
            matched.append((basis, record))

        channels = sorted(
            {
                normalize_platform_name(record.channel)
                for _, record in matched
                if normalize_platform_name(record.channel)
            }
        )
        if len(channels) == 1:
            row["candidate_channel"] = channels[0]
            row["candidate_basis"] = matched[0][0]
        elif len(channels) > 1:
            row["candidate_basis"] = "ambiguous_source"
        row["reservation_no"] = reservation_hint
        enriched.append(row)
    return enriched


def to_int(value: Any) -> Optional[int]:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_key(value: str) -> str:
    return re.sub(r"[^0-9a-zA-Z\uac00-\ud7a3]", "", str(value).strip().lower())


def get_first_value_by_alias(row: Dict[str, Any], aliases: List[str]) -> Any:
    if not row:
        return None
    normalized = {normalize_key(k): v for k, v in row.items()}
    for alias in aliases:
        key = normalize_key(alias)
        if key in normalized:
            return normalized[key]
    return None


def parse_any_date(value: Any) -> Optional[dt.date]:
    if value is None:
        return None
    if isinstance(value, dt.date):
        return value
    text = normalize_text(str(value))
    if not text:
        return None
    text = text.split("T", 1)[0]
    text = text.split(" ", 1)[0]
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d"):
        try:
            return dt.datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    try:
        return dt.date.fromisoformat(text)
    except ValueError:
        return None


def parse_report_window(report_start: str, report_end: str) -> Tuple[Optional[dt.date], Optional[dt.date]]:
    start_raw = normalize_text(report_start)
    end_raw = normalize_text(report_end)
    start_date = parse_any_date(start_raw) if start_raw else None
    end_date = parse_any_date(end_raw) if end_raw else None
    if start_raw and start_date is None:
        raise AuditError(f"Invalid --report-start-date: {report_start}")
    if end_raw and end_date is None:
        raise AuditError(f"Invalid --report-end-date: {report_end}")
    if start_date and end_date and start_date > end_date:
        raise AuditError("--report-start-date must be <= --report-end-date")
    return start_date, end_date


def _interval_overlaps_window(
    start: Optional[dt.date],
    end_exclusive: Optional[dt.date],
    window_start: Optional[dt.date],
    window_end: Optional[dt.date],
) -> bool:
    if window_start is None and window_end is None:
        return True
    if start is None and end_exclusive is None:
        return False
    if start is None and end_exclusive is not None:
        start = end_exclusive - dt.timedelta(days=1)
    if end_exclusive is None and start is not None:
        end_exclusive = start + dt.timedelta(days=1)
    if start is None or end_exclusive is None:
        return False
    if end_exclusive <= start:
        end_exclusive = start + dt.timedelta(days=1)
    end_inclusive = end_exclusive - dt.timedelta(days=1)
    if window_start and end_inclusive < window_start:
        return False
    if window_end and start > window_end:
        return False
    return True


def filter_cross_validation_inputs_by_report_window(
    blocks: List[ReservationBlock],
    source_records: List[SourceReservation],
    report_start: str,
    report_end: str,
) -> Tuple[List[ReservationBlock], List[SourceReservation], Dict[str, Any]]:
    window_start, window_end = parse_report_window(report_start, report_end)
    if window_start is None and window_end is None:
        return (
            list(blocks),
            list(source_records),
            {
                "enabled": False,
                "start": "",
                "end": "",
                "blocks_before": len(blocks),
                "blocks_after": len(blocks),
                "sources_before": len(source_records),
                "sources_after": len(source_records),
            },
        )

    filtered_blocks = [
        block
        for block in blocks
        if _interval_overlaps_window(
            parse_any_date(getattr(block, "checkin", None)),
            parse_any_date(getattr(block, "checkout", None)),
            window_start,
            window_end,
        )
    ]
    filtered_sources = [
        record
        for record in source_records
        if _interval_overlaps_window(
            parse_any_date(getattr(record, "checkin", None)),
            parse_any_date(getattr(record, "checkout", None)),
            window_start,
            window_end,
        )
    ]

    source_scope_mode = "stay_overlap"
    pre_arrival_blocks_removed = 0
    source_systems = {
        normalize_text(getattr(record, "source_system", "")).upper()
        for record in filtered_sources
        if normalize_text(getattr(record, "source_system", ""))
    }
    pms_arrival_scoped = bool(window_start) and bool(filtered_sources) and source_systems == {"PMS"}
    if pms_arrival_scoped:
        has_prestart_source = any(
            (parse_any_date(getattr(record, "checkin", None)) or window_start) < window_start
            for record in filtered_sources
        )
        if not has_prestart_source:
            narrowed_blocks = [
                block
                for block in filtered_blocks
                if (
                    (parse_any_date(getattr(block, "checkin", None)) is not None)
                    and parse_any_date(getattr(block, "checkin", None)) >= window_start
                    and (
                        window_end is None
                        or parse_any_date(getattr(block, "checkin", None)) <= window_end
                    )
                )
            ]
            pre_arrival_blocks_removed = len(filtered_blocks) - len(narrowed_blocks)
            filtered_blocks = narrowed_blocks
            source_scope_mode = "pms_arrival_checkin"

    return (
        filtered_blocks,
        filtered_sources,
        {
            "enabled": True,
            "start": window_start.isoformat() if window_start else "",
            "end": window_end.isoformat() if window_end else "",
            "blocks_before": len(blocks),
            "blocks_after": len(filtered_blocks),
            "sources_before": len(source_records),
            "sources_after": len(filtered_sources),
            "source_scope_mode": source_scope_mode,
            "pre_arrival_blocks_removed": pre_arrival_blocks_removed,
        },
    )


def infer_channel_from_text(value: str) -> str:
    low = normalize_text(value).lower()
    if not low:
        return ""
    if "uh suite" in low or "station" in low or "스테이션" in low:
        return "STATION"
    if "naver" in low or "네이버" in low:
        return "NAVER"
    if "wings" in low:
        return "WINGS"
    return normalize_platform_name(value)


def normalize_channel(value: str, source_system: str = "") -> str:
    base = infer_channel_from_text(value)
    if base and base != normalize_text(value):
        return base
    normalized = normalize_platform_name(value)
    if normalized:
        return normalized
    src = normalize_text(source_system).upper()
    if src == "NAVER":
        return "NAVER"
    if src == "STATION":
        return "STATION"
    return "UNKNOWN"


def calculate_checkout_from_dates(
    checkin: Optional[dt.date], checkout: Optional[dt.date], nights: Optional[int]
) -> Tuple[Optional[dt.date], Optional[dt.date], int]:
    if checkin and checkout and checkout > checkin:
        return checkin, checkout, (checkout - checkin).days
    if checkin and nights and nights > 0:
        calc_checkout = checkin + dt.timedelta(days=nights)
        return checkin, calc_checkout, nights
    if checkin:
        calc_checkout = checkin + dt.timedelta(days=1)
        return checkin, calc_checkout, 1
    return None, None, 0


def coerce_reservation_no(value: Any) -> str:
    text = normalize_text(str(value or ""))
    if not text:
        return ""
    m = re.search(r"[0-9A-Za-z_-]{6,}", text)
    return m.group(0) if m else text


def split_room_tokens(value: Any) -> List[str]:
    text = normalize_text(str(value or ""))
    if not text:
        return []
    out: List[str] = []
    seen: set[str] = set()
    for raw in re.split(r"[,;/|]+", text):
        token = normalize_text(raw).upper().replace(" ", "").replace("-", "")
        if not token:
            continue
        if token.isdigit():
            token = str(int(token))
        if token in seen:
            continue
        seen.add(token)
        out.append(token)
    return out


def normalize_branch_label(value: str) -> str:
    text = normalize_text(value)
    if not text:
        return ""
    low = text.lower()
    if "coex" in low or "코엑스" in low:
        return "COEX"
    if "gangnam" in low or "강남" in low:
        return "GANGNAM"
    if "seolleung" in low or "선릉" in low:
        return "BRANCH_THE_SEOLLEUNG"
    if "samsung" in low or "삼성" in low:
        return "BRANCH_THE_SAMSUNG"
    if text.upper().startswith("BRANCH_"):
        return text.upper()
    return text.upper()


def parse_pms_branch_map(raw_value: str) -> Dict[str, str]:
    text = normalize_text(raw_value)
    if not text:
        return {}
    entries: Dict[str, str] = {}
    chunks = [item for item in re.split(r"[\n,]+", text) if normalize_text(item)]
    for chunk in chunks:
        if "=" not in chunk:
            continue
        left, right = chunk.split("=", 1)
        key = normalize_text(left).upper().replace(" ", "")
        value = normalize_branch_label(right)
        if key and value:
            entries[key] = value
    return entries


def parse_branch_scope(raw_value: str) -> List[str]:
    text = normalize_text(raw_value)
    if not text:
        return []
    chunks = [item for item in re.split(r"[\n,]+", text) if normalize_text(item)]
    out: List[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        normalized = normalize_branch_label(chunk)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
    return out


def _extract_source_property_keys(row: Dict[str, Any]) -> List[str]:
    property_no = normalize_text(
        str(
            get_first_value_by_alias(
                row,
                ["property_no", "propertyNo", "property_code", "property"],
            )
            or ""
        )
    )
    bsns_code = normalize_text(
        str(get_first_value_by_alias(row, ["bsns_code", "bsnsCode", "business_code"]) or "")
    )
    keys: List[str] = []
    if property_no:
        keys.extend(
            [
                property_no.upper().replace(" ", ""),
                f"PROPERTY_{property_no.upper().replace(' ', '')}",
                f"P:{property_no.upper().replace(' ', '')}",
            ]
        )
    if bsns_code:
        keys.extend(
            [
                bsns_code.upper().replace(" ", ""),
                f"BSNS_{bsns_code.upper().replace(' ', '')}",
                f"B:{bsns_code.upper().replace(' ', '')}",
            ]
        )
    if property_no and bsns_code:
        pair = f"{bsns_code.upper().replace(' ', '')}:{property_no.upper().replace(' ', '')}"
        keys.append(pair)
        keys.append(f"P{pair}")
    dedup: List[str] = []
    seen: set[str] = set()
    for key in keys:
        if key in seen:
            continue
        seen.add(key)
        dedup.append(key)
    return dedup


def infer_branch_from_source_row(
    row: Dict[str, Any],
    channel_raw: str,
    account: str,
    pms_branch_map: Optional[Dict[str, str]] = None,
) -> str:
    branch_raw = normalize_text(str(get_first_value_by_alias(row, BRANCH_FIELD_ALIASES) or ""))
    if pms_branch_map:
        for key in _extract_source_property_keys(row):
            mapped = normalize_branch_label(pms_branch_map.get(key, ""))
            if mapped:
                return mapped
    property_name = normalize_text(
        str(
            get_first_value_by_alias(
                row,
                ["property_name", "property_no_name", "hotel_name", "hotel"],
            )
            or ""
        )
    )
    candidates = " ".join(
        part for part in [branch_raw, property_name, channel_raw, account] if normalize_text(part)
    ).lower()
    keyword_branch = normalize_branch_label(candidates)
    if keyword_branch in {"COEX", "GANGNAM", "BRANCH_THE_SEOLLEUNG", "BRANCH_THE_SAMSUNG"}:
        return keyword_branch
    if branch_raw.isdigit():
        return f"PROPERTY_{int(branch_raw)}"
    return ""


def normalize_nationality_nights(value: Any, nights: int) -> str:
    text = normalize_text(str(value or ""))
    if not text:
        return ""
    if re.search(r"\d+\s*\ubc15", text):
        return text
    if nights > 0:
        return f"{text} {nights}\ubc15"
    return text


def parse_source_row(
    row: Dict[str, Any],
    source_system: str,
    default_channel: str = "",
    pms_branch_map: Optional[Dict[str, str]] = None,
) -> Optional[SourceReservation]:
    reservation_no = coerce_reservation_no(
        get_first_value_by_alias(row, RES_NO_FIELD_ALIASES)
    )
    if not reservation_no:
        return None

    checkin = parse_any_date(get_first_value_by_alias(row, CHECKIN_FIELD_ALIASES))
    checkout = parse_any_date(get_first_value_by_alias(row, CHECKOUT_FIELD_ALIASES))
    nights = to_int(get_first_value_by_alias(row, NIGHTS_FIELD_ALIASES))
    checkin, checkout, nights_final = calculate_checkout_from_dates(
        checkin, checkout, nights
    )
    if not checkin or not checkout or nights_final <= 0:
        return None

    channel_raw = normalize_text(str(get_first_value_by_alias(row, CHANNEL_FIELD_ALIASES) or ""))
    account = normalize_text(str(get_first_value_by_alias(row, ACCOUNT_FIELD_ALIASES) or ""))
    room_tokens = split_room_tokens(get_first_value_by_alias(row, ROOM_FIELD_ALIASES))
    room_no = ",".join(room_tokens)
    price = parse_money_to_int(str(get_first_value_by_alias(row, PRICE_FIELD_ALIASES) or ""))
    status_raw = normalize_text(str(get_first_value_by_alias(row, STATUS_FIELD_ALIASES) or ""))
    status = normalize_reservation_status(status_raw)
    status_bucket = classify_reservation_status_bucket(status)
    audit_anomaly = has_reservation_audit_anomaly(status)
    branch = infer_branch_from_source_row(
        row,
        channel_raw=channel_raw,
        account=account,
        pms_branch_map=pms_branch_map,
    )
    reservation_ref = coerce_reservation_no(
        get_first_value_by_alias(row, ["global_rsvn_no", "guest_rsvn_no", "rsvn_seq_no"])
    )
    nationality_nights = normalize_nationality_nights(
        get_first_value_by_alias(row, NATIONALITY_FIELD_ALIASES),
        nights_final,
    )

    effective_channel = normalize_channel(channel_raw, source_system)
    generic_channels = {"", "UNKNOWN", "PMS", "WINGS", "CMS", "PHN"}
    if effective_channel in generic_channels:
        account_channel = normalize_channel(account or default_channel, source_system)
        if account_channel not in {"", "UNKNOWN", "PMS", "WINGS"}:
            effective_channel = account_channel
    if effective_channel in {"", "UNKNOWN"} and default_channel:
        effective_channel = normalize_channel(default_channel, source_system)
    return SourceReservation(
        source_system=source_system,
        reservation_no=reservation_no,
        channel=effective_channel,
        checkin=checkin,
        checkout=checkout,
        nights=nights_final,
        room_no=room_no,
        price=price,
        account=account,
        status=status,
        status_bucket=status_bucket,
        audit_anomaly=audit_anomaly,
        branch=branch,
        reservation_ref=reservation_ref,
        nationality_nights=nationality_nights,
        raw=row,
    )


def iter_json_objects(value: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for v in value.values():
            yield from iter_json_objects(v)
    elif isinstance(value, list):
        for item in value:
            yield from iter_json_objects(item)


def try_parse_json_text(text: str) -> Optional[Any]:
    raw = text.strip()
    if not raw:
        return None
    candidates = [raw]
    if raw.startswith(")]}'"):
        candidates.append(raw[4:].lstrip())
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    return None


def parse_source_file(
    path: Path,
    source_system: str,
    default_channel: str = "",
    pms_branch_map: Optional[Dict[str, str]] = None,
) -> List[SourceReservation]:
    records: List[SourceReservation] = []
    ext = path.suffix.lower()

    def decode_text_with_fallback(raw: bytes) -> str:
        last_err: Optional[Exception] = None
        for enc in ("utf-8-sig", "utf-8", "cp949", "euc-kr"):
            try:
                return raw.decode(enc)
            except UnicodeDecodeError as exc:
                last_err = exc
        if last_err:
            raise last_err
        return raw.decode("utf-8", errors="replace")

    def parse_text_blob(text: str, blob_ext: str) -> List[SourceReservation]:
        blob_records: List[SourceReservation] = []
        if blob_ext in (".csv", ".tsv"):
            delimiter = "\t" if blob_ext == ".tsv" else ","
            reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
            for row in reader:
                parsed = parse_source_row(
                    dict(row),
                    source_system,
                    default_channel,
                    pms_branch_map=pms_branch_map,
                )
                if parsed:
                    blob_records.append(parsed)
            return blob_records

        if blob_ext in (".json", ".har", ".txt", ".log"):
            data = try_parse_json_text(text)
            if data is None:
                return blob_records
            for obj in iter_json_objects(data):
                parsed = parse_source_row(
                    obj,
                    source_system,
                    default_channel,
                    pms_branch_map=pms_branch_map,
                )
                if parsed:
                    blob_records.append(parsed)
            return blob_records

        return blob_records

    if ext == ".zip":
        with zipfile.ZipFile(path) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                inner_ext = Path(info.filename).suffix.lower()
                if inner_ext not in (".csv", ".tsv", ".json", ".har", ".txt", ".log"):
                    continue
                try:
                    text = decode_text_with_fallback(zf.read(info))
                except Exception:
                    continue
                records.extend(parse_text_blob(text, inner_ext))
        return records

    if ext in (".csv", ".tsv", ".json", ".har", ".txt", ".log"):
        text = decode_text_with_fallback(path.read_bytes())
        records.extend(parse_text_blob(text, ext))
        return records

    return records


def stay_dates(checkin: dt.date, checkout: dt.date) -> List[dt.date]:
    days: List[dt.date] = []
    cursor = checkin
    while cursor < checkout:
        days.append(cursor)
        cursor += dt.timedelta(days=1)
    return days

def generate_pkce_verifier() -> str:
    return secrets.token_urlsafe(64)


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def build_google_oauth_url(
    client_id: str, redirect_uri: str, scope: str, verifier: str, state: str
) -> str:
    challenge = pkce_challenge(verifier)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "access_type": "offline",
        "prompt": "consent",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + "&".join(
        f"{k}={requests.utils.quote(str(v), safe='')}" for k, v in params.items()
    )


def parse_redirect_uri(redirect_uri: str) -> Tuple[str, int, str]:
    parsed = urlparse(redirect_uri)
    if parsed.scheme.lower() != "http":
        raise AuditError("?먮룞 OAuth??http 由щ떎?대젆??URI留?吏?먰빀?덈떎.")
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port
    if port is None:
        port = 80
    path = parsed.path or "/"
    return host, int(port), path


def receive_oauth_code_local(
    auth_url: str,
    redirect_uri: str,
    expected_state: str,
    timeout_sec: int = 240,
    open_browser: bool = True,
) -> str:
    host, port, expected_path = parse_redirect_uri(redirect_uri)
    result: Dict[str, Optional[str]] = {
        "code": None,
        "state": None,
        "error": None,
    }
    done_event = threading.Event()

    class OAuthCallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            if parsed.path != expected_path:
                self.send_response(404)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write("Not Found".encode("utf-8"))
                return

            query = parse_qs(parsed.query)
            result["code"] = query.get("code", [None])[0]
            result["state"] = query.get("state", [None])[0]
            result["error"] = query.get("error", [None])[0]
            done_event.set()

            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            body = (
                "<html><body><h2>OAuth ?섏떊 ?꾨즺</h2>"
                "<p>??李쎌? ?レ븘???⑸땲??</p></body></html>"
            )
            self.wfile.write(body.encode("utf-8"))

        def log_message(self, _format: str, *_args: Any) -> None:
            return

    try:
        server = HTTPServer((host, port), OAuthCallbackHandler)
    except OSError as exc:
        raise AuditError(
            f"OAuth 肄쒕갚 ?쒕쾭瑜??????놁뒿?덈떎: {host}:{port}. ?ы듃 ?ъ슜以??щ?瑜??뺤씤?섏꽭?? ({exc})"
        ) from exc

    def serve_once() -> None:
        while not done_event.is_set():
            server.timeout = 1
            server.handle_request()

    thread = threading.Thread(target=serve_once, daemon=True)
    thread.start()
    print(f"[OAuth] 肄쒕갚 ?湲곗쨷: {redirect_uri}")
    print("[OAuth] ?꾨옒 URL???댁뼱 濡쒓렇???숈쓽瑜??꾨즺?섏꽭??")
    print(auth_url)
    if open_browser:
        try:
            webbrowser.open(auth_url, new=2)
        except Exception:
            print("[OAuth] 釉뚮씪?곗? ?먮룞 ?닿린 ?ㅽ뙣. URL??吏곸젒 ?댁뼱二쇱꽭??")

    if not done_event.wait(timeout=max(int(timeout_sec), 30)):
        server.server_close()
        raise AuditError(
            f"OAuth code ?섏떊 ??꾩븘??{timeout_sec}珥?. URL???ㅼ떆 ?닿퀬 ?ъ떆?꾪븯?몄슂."
        )

    server.server_close()
    if result.get("error"):
        raise AuditError(f"OAuth ?뱀씤 ?ㅽ뙣: {result['error']}")
    if result.get("state") != expected_state:
        raise AuditError("OAuth state 遺덉씪移섎줈 以묐떒?⑸땲??")
    code = result.get("code")
    if not code:
        raise AuditError("OAuth code瑜??섏떊?섏? 紐삵뻽?듬땲??")
    return code


def oauth_auto_issue_token(
    client_id: str,
    redirect_uri: str,
    scope: str,
    token_file: Path,
    client_secret: str = "",
    timeout_sec: int = 240,
    open_browser: bool = True,
) -> Dict[str, Any]:
    verifier = generate_pkce_verifier()
    state = secrets.token_urlsafe(24)
    auth_url = build_google_oauth_url(
        client_id=client_id,
        redirect_uri=redirect_uri,
        scope=scope,
        verifier=verifier,
        state=state,
    )
    code = receive_oauth_code_local(
        auth_url=auth_url,
        redirect_uri=redirect_uri,
        expected_state=state,
        timeout_sec=timeout_sec,
        open_browser=open_browser,
    )
    token = exchange_auth_code_for_token(
        client_id=client_id,
        code=code,
        verifier=verifier,
        redirect_uri=redirect_uri,
        client_secret=client_secret,
    )
    token["client_id"] = client_id
    token["scope"] = scope
    if client_secret:
        token["client_secret"] = client_secret
    save_json(token_file, token)
    return token


def enrich_token_expiry(token_payload: Dict[str, Any]) -> None:
    expires_in = token_payload.get("expires_in")
    if expires_in:
        try:
            token_payload["expires_at"] = int(dt.datetime.now().timestamp()) + int(
                expires_in
            )
        except (TypeError, ValueError):
            pass


def exchange_auth_code_for_token(
    client_id: str,
    code: str,
    verifier: str,
    redirect_uri: str,
    client_secret: str = "",
) -> Dict[str, Any]:
    url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": client_id,
        "grant_type": "authorization_code",
        "code": code,
        "code_verifier": verifier,
        "redirect_uri": redirect_uri,
    }
    if client_secret:
        data["client_secret"] = client_secret
    resp = requests.post(url, data=data, timeout=30)
    if resp.status_code >= 400:
        raise AuditError(f"OAuth code exchange ?ㅽ뙣: {resp.status_code} {resp.text}")
    payload = resp.json()
    enrich_token_expiry(payload)
    return payload


def refresh_access_token(
    client_id: str, refresh_token: str, client_secret: str = ""
) -> Dict[str, Any]:
    url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": client_id,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }
    if client_secret:
        data["client_secret"] = client_secret
    resp = requests.post(url, data=data, timeout=30)
    if resp.status_code >= 400:
        raise AuditError(f"OAuth token refresh ?ㅽ뙣: {resp.status_code} {resp.text}")
    payload = resp.json()
    enrich_token_expiry(payload)
    return payload


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, payload: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def save_json_compact(path: Path, payload: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))


def _collect_sheet_branch_scope(blocks: List[ReservationBlock]) -> set[str]:
    return {
        normalize_branch_label(block.branch)
        for block in blocks
        if normalize_branch_label(block.branch)
    }


def _extract_source_property_debug_meta(record: SourceReservation) -> Dict[str, str]:
    raw = record.raw or {}
    property_no = normalize_text(
        str(
            get_first_value_by_alias(
                raw,
                ["property_no", "propertyNo", "property_code", "property"],
            )
            or ""
        )
    )
    bsns_code = normalize_text(
        str(get_first_value_by_alias(raw, ["bsns_code", "bsnsCode", "business_code"]) or "")
    )
    property_name = normalize_text(
        str(
            get_first_value_by_alias(
                raw,
                ["property_name", "property_no_name", "hotel_name", "hotel"],
            )
            or ""
        )
    )
    return {
        "property_no": property_no,
        "bsns_code": bsns_code,
        "property_name": property_name,
    }


def apply_pms_branch_scope_filter(
    blocks: List[ReservationBlock],
    source_records: List[SourceReservation],
) -> Tuple[List[SourceReservation], Dict[str, Any]]:
    sheet_branch_scope = _collect_sheet_branch_scope(blocks)
    included: List[SourceReservation] = []
    excluded_rows: List[Dict[str, Any]] = []
    excluded_reason_counts: Counter[str] = Counter()
    excluded_branch_counts: Counter[str] = Counter()
    included_pms = 0
    excluded_pms = 0

    for record in source_records:
        source_system = normalize_text(record.source_system).upper()
        if source_system != "PMS":
            included.append(record)
            continue
        normalized_branch = normalize_branch_label(record.branch)
        if not normalized_branch:
            excluded_pms += 1
            excluded_reason_counts["UNMAPPED_PMS_BRANCH"] += 1
            meta = _extract_source_property_debug_meta(record)
            excluded_rows.append(
                {
                    "reason": "UNMAPPED_PMS_BRANCH",
                    "reservation_no": record.reservation_no,
                    "source_branch": normalize_text(record.branch),
                    "sheet_branch_scope": sorted(sheet_branch_scope),
                    **meta,
                    "checkin": record.checkin.isoformat() if record.checkin else "",
                    "checkout": record.checkout.isoformat() if record.checkout else "",
                    "room_no": normalize_text(record.room_no),
                    "channel": normalize_text(record.channel),
                }
            )
            continue
        if sheet_branch_scope and normalized_branch not in sheet_branch_scope:
            excluded_pms += 1
            excluded_reason_counts["OUT_OF_SHEET_SCOPE"] += 1
            excluded_branch_counts[normalized_branch] += 1
            meta = _extract_source_property_debug_meta(record)
            excluded_rows.append(
                {
                    "reason": "OUT_OF_SHEET_SCOPE",
                    "reservation_no": record.reservation_no,
                    "source_branch": normalized_branch,
                    "sheet_branch_scope": sorted(sheet_branch_scope),
                    **meta,
                    "checkin": record.checkin.isoformat() if record.checkin else "",
                    "checkout": record.checkout.isoformat() if record.checkout else "",
                    "room_no": normalize_text(record.room_no),
                    "channel": normalize_text(record.channel),
                }
            )
            continue
        included_pms += 1
        included.append(record)

    return included, {
        "sheet_branch_scope": sorted(sheet_branch_scope),
        "input_source_records": len(source_records),
        "included_source_records": len(included),
        "included_pms_records": included_pms,
        "excluded_pms_records": excluded_pms,
        "excluded_reason_counts": dict(excluded_reason_counts),
        "excluded_branch_counts": dict(excluded_branch_counts),
        "excluded_rows": excluded_rows,
    }


def write_pms_branch_scope_exclusions_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    keys = [
        "reason",
        "reservation_no",
        "source_branch",
        "sheet_branch_scope",
        "property_no",
        "bsns_code",
        "property_name",
        "checkin",
        "checkout",
        "room_no",
        "channel",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            row_out = dict(row)
            if isinstance(row_out.get("sheet_branch_scope"), list):
                row_out["sheet_branch_scope"] = "|".join(str(x) for x in row_out["sheet_branch_scope"])
            writer.writerow({k: row_out.get(k, "") for k in keys})


def _normalize_trace_room_token(value: Any) -> str:
    return normalize_text(str(value or "")).upper().replace(" ", "").replace("-", "")


def _iter_issue_date_candidates(issue: Dict[str, Any]) -> Iterable[str]:
    direct_date = normalize_text(str(issue.get("date", "")))
    if direct_date:
        yield direct_date
    for key in (
        "duplicate_dates",
        "missing_in_source_dates",
        "missing_in_sheet_dates",
        "sheet_dates",
        "source_dates",
    ):
        value = issue.get(key)
        if isinstance(value, (list, tuple, set)):
            for item in value:
                text = normalize_text(str(item))
                if text:
                    yield text


def extract_issue_dates(issue: Dict[str, Any]) -> List[dt.date]:
    out: List[dt.date] = []
    seen: set[dt.date] = set()
    for candidate in _iter_issue_date_candidates(issue):
        parsed = parse_any_date(candidate)
        if not parsed or parsed in seen:
            continue
        seen.add(parsed)
        out.append(parsed)
    return sorted(out)


def issue_is_suspect(issue: Dict[str, Any]) -> bool:
    issue_type = normalize_text(str(issue.get("type", ""))).upper()
    if issue_type.endswith("_SUSPECT"):
        return True
    return issue_type in {
        "MISSING_ACTIVE_IN_PMS",
        "MISSING_ACTIVE_IN_SHEET",
        "CHANNEL_MISMATCH",
        "ROOM_MISMATCH",
        "DATE_MISMATCH",
        "CHECKIN_MISMATCH",
        "CHECKOUT_MISMATCH",
        "NIGHTS_MISMATCH",
        "PRICE_MISMATCH_SOURCE",
        "ACTIVE_EXPECTED_BUT_PMS_AUDIT_ANOMALY",
    }


def select_trace_blocks_for_issue(
    blocks: List[ReservationBlock],
    issue: Dict[str, Any],
) -> List[ReservationBlock]:
    reservation_no = normalize_text(str(issue.get("reservation_no", "")))
    if not reservation_no:
        return []
    target_dates = extract_issue_dates(issue)
    target_rooms: set[str] = set()
    for key in ("room_no",):
        room_text = _normalize_trace_room_token(issue.get(key, ""))
        if room_text:
            target_rooms.add(room_text)
    for key in ("sheet_room_nos", "extra_sheet_room_nos"):
        values = issue.get(key)
        if not isinstance(values, (list, tuple, set)):
            continue
        for item in values:
            room_text = _normalize_trace_room_token(item)
            if room_text:
                target_rooms.add(room_text)

    matches: List[ReservationBlock] = []
    for block in blocks:
        if normalize_text(block.reservation_no) != reservation_no:
            continue
        if target_rooms and _normalize_trace_room_token(block.room_no) not in target_rooms:
            continue
        if target_dates:
            if not block.checkin or not block.checkout:
                continue
            if not any(block.checkin <= day < block.checkout for day in target_dates):
                continue
        matches.append(block)

    if not matches and (target_rooms or target_dates):
        matches = [
            block for block in blocks if normalize_text(block.reservation_no) == reservation_no
        ]
    return sorted(matches, key=lambda b: (b.row, b.start_col, b.end_col))


def build_suspect_trace_artifact(
    *,
    cross_issues: List[Dict[str, Any]],
    blocks: List[ReservationBlock],
    summary_meta: Dict[str, str],
) -> Dict[str, Any]:
    suspects: List[Dict[str, Any]] = []
    for issue_index, issue in enumerate(cross_issues):
        if not issue_is_suspect(issue):
            continue
        matched_blocks = select_trace_blocks_for_issue(blocks, issue)
        packets = [build_trace_packet(block, summary_meta) for block in matched_blocks]
        suspects.append(
            {
                "issue_index": issue_index,
                "type": normalize_text(str(issue.get("type", ""))),
                "reservation_no": normalize_text(str(issue.get("reservation_no", ""))),
                "dates": [day.isoformat() for day in extract_issue_dates(issue)],
                "trace_count": len(packets),
                "trace_blocks": packets,
                "issue": issue,
            }
        )
    return {"count": len(suspects), "suspects": suspects}


def write_suspect_trace_csv(path: Path, artifact: Dict[str, Any]) -> None:
    keys = [
        "type",
        "reservation_no",
        "issue_index",
        "issue_dates",
        "trace_count",
        "trace_rows",
        "trace_rooms",
        "trace_ranges",
        "trace_reservation_keys",
    ]
    suspects = artifact.get("suspects", [])
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for item in suspects:
            trace_blocks = item.get("trace_blocks", [])
            writer.writerow(
                {
                    "type": item.get("type", ""),
                    "reservation_no": item.get("reservation_no", ""),
                    "issue_index": item.get("issue_index", ""),
                    "issue_dates": "|".join(item.get("dates", [])),
                    "trace_count": item.get("trace_count", 0),
                    "trace_rows": "|".join(str(packet.get("row", "")) for packet in trace_blocks),
                    "trace_rooms": "|".join(
                        normalize_text(str(packet.get("room_no", ""))) for packet in trace_blocks
                    ),
                    "trace_ranges": "|".join(
                        normalize_text(str(packet.get("sheet_range_a1", "")))
                        for packet in trace_blocks
                    ),
                    "trace_reservation_keys": "|".join(
                        normalize_text(str(packet.get("reservation_key", "")))
                        for packet in trace_blocks
                    ),
                }
            )


def room_no_matches_fixed_map(room_no: str) -> bool:
    for key in room_no_alias_keys(room_no):
        if ROOM_TYPE_BY_ROOM_NO.get(normalize_room_no_key(key)):
            return True
    return False


def build_room_rows_vac_artifact(
    matrix: SheetMatrix,
    date_cols: List[Any],
    room_rows: Dict[int, Any],
    room_row_logs: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    vac_total = 0
    unknown_total = 0
    classification_miss = 0
    structure_noise = 0
    vac_source_counts: Counter[str] = Counter()

    for date_col in date_cols:
        date_iso = date_col.date.isoformat()
        for row_index, room in room_rows.items():
            cell = matrix.get(row_index, date_col.col)
            status, _channel, _error = classify_color_cell(
                cell.background_hex,
                note=cell.note,
                formatted_value=cell.formatted_value,
            )
            if status != CELL_STATUS_VACANT:
                continue
            vac_total += 1
            room_type = normalize_text(room.room_type)
            room_type_upper = room_type.upper()
            room_type_source = normalize_text(getattr(room, "room_type_source", "")).lower()
            vac_source_counts[room_type_source or "unspecified"] += 1
            rows.append(
                {
                    "date": date_iso,
                    "row_type": "room_row",
                    "room_row": row_index + 1,
                    "branch": normalize_text(getattr(room, "branch", "")).upper(),
                    "room_no": normalize_text(room.room_no),
                    "building": normalize_text(getattr(room, "building", "")).upper(),
                    "room_number": normalize_text(getattr(room, "room_number", "")),
                    "sheet_room_no": normalize_text(getattr(room, "sheet_room_no", "")).upper(),
                    "canonical_id": normalize_text(getattr(room, "canonical_id", "")).upper(),
                    "pms_room_no": normalize_text(getattr(room, "pms_room_no", "")),
                    "parsed_room_type": room_type,
                    "room_type_source": room_type_source,
                    "raw_text": normalize_text(getattr(room, "raw_text", "")),
                }
            )

            if room_type_upper == "UNKNOWN_ROOM_TYPE":
                unknown_total += 1
                if room_no_matches_fixed_map(room.room_no):
                    classification_miss += 1
                else:
                    structure_noise += 1

    for row_log in room_row_logs:
        if normalize_text(row_log.get("room_type_source", "")).lower() != "noise":
            continue
        rows.append(
            {
                "date": "",
                "row_type": normalize_text(row_log.get("row_type", "noise_row")).lower(),
                "room_row": row_log.get("room_row", ""),
                "branch": normalize_text(row_log.get("branch", "")).upper(),
                "room_no": normalize_text(row_log.get("room_no", "")),
                "building": normalize_text(row_log.get("building", "")).upper(),
                "room_number": normalize_text(row_log.get("room_number", "")),
                "sheet_room_no": normalize_text(row_log.get("sheet_room_no", "")).upper(),
                "canonical_id": normalize_text(row_log.get("canonical_id", "")).upper(),
                "pms_room_no": normalize_text(row_log.get("pms_room_no", "")),
                "parsed_room_type": normalize_text(row_log.get("parsed_room_type", "")),
                "room_type_source": "noise",
                "raw_text": normalize_text(row_log.get("raw_text", "")),
            }
        )

    unknown_rate = (unknown_total / vac_total) if vac_total else 0.0
    miss_rate = (classification_miss / unknown_total) if unknown_total else 0.0
    noise_rate = (structure_noise / unknown_total) if unknown_total else 0.0

    metrics = {
        "unknown_actual_room_vac": classification_miss,
        "unknown_total_vac": unknown_total,
        "vac_total": vac_total,
        "vac_room_type_source_counts": dict(vac_source_counts),
        "UNKNOWN_RATE": {
            "unknown": unknown_total,
            "total": vac_total,
            "ratio": round(unknown_rate, 6),
        },
        "CLASSIFICATION_MISS_RATE": {
            "classification_miss": classification_miss,
            "unknown": unknown_total,
            "ratio": round(miss_rate, 6),
        },
        "STRUCTURE_NOISE_RATE": {
            "structure_noise": structure_noise,
            "unknown": unknown_total,
            "ratio": round(noise_rate, 6),
        },
    }
    return rows, metrics


def join_unique_text(values: Iterable[Any]) -> str:
    out: List[str] = []
    seen: set[str] = set()
    for value in values:
        text = normalize_text(value)
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return "|".join(out)


def room_registry_sort_key(value: Any) -> Tuple[int, Any]:
    text = normalize_text(value)
    if text.isdigit():
        return (0, int(text))
    return (1, text)


def as_value_list(value: Any) -> List[Any]:
    if isinstance(value, (list, tuple, set)):
        return list(value)
    return [value]


def build_room_registry_issue(
    *,
    issue_type: str,
    branch: str = "",
    pms_room_no: str = "",
    canonical_ids: Any = "",
    sheet_room_nos: Any = "",
    sheet_rows: Any = "",
) -> Dict[str, str]:
    return {
        "issue_type": normalize_text(issue_type).upper(),
        "branch": normalize_text(branch).upper(),
        "pms_room_no": normalize_text(pms_room_no),
        "canonical_ids": join_unique_text(as_value_list(canonical_ids)).upper(),
        "sheet_room_nos": join_unique_text(as_value_list(sheet_room_nos)).upper(),
        "sheet_rows": join_unique_text(as_value_list(sheet_rows)),
    }


def is_valid_room_registry_sheet_pattern(sheet_room_no: str) -> bool:
    text = normalize_text(sheet_room_no).upper()
    if not text:
        return False
    return any(pattern.fullmatch(text) for pattern in ROOM_REGISTRY_ALLOWED_PATTERNS)


def infer_room_floor(room_number: str) -> Optional[int]:
    text = normalize_text(room_number)
    if not text.isdigit():
        return None
    if len(text) == 3:
        return int(text[0])
    if len(text) == 4:
        return int(text[:2])
    return None


def resolve_room_registry_building_max_floor(branch: str, building: str) -> Optional[int]:
    branch_key = normalize_text(branch).upper()
    building_key = normalize_text(building).upper()
    override = ROOM_REGISTRY_BRANCH_BUILDING_MAX_FLOOR.get((branch_key, building_key))
    if override is not None:
        return int(override)
    return ROOM_REGISTRY_BUILDING_MAX_FLOOR.get(building_key)


def normalize_room_registry_snapshot_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    normalized: Dict[str, Dict[str, str]] = {}
    for row in rows or []:
        canonical_id = normalize_text(row.get("canonical_id", "")).upper()
        if not canonical_id:
            continue
        normalized[canonical_id] = {
            "canonical_id": canonical_id,
            "branch": normalize_text(row.get("branch", "")).upper(),
            "building": normalize_text(row.get("building", "")).upper(),
            "room_number": normalize_text(row.get("room_number", "")),
            "sheet_room_no": normalize_text(row.get("sheet_room_no", "")).upper(),
            "pms_room_no": normalize_text(row.get("pms_room_no", "")),
        }
    return [
        normalized[key]
        for key in sorted(normalized.keys())
    ]


def _changed_snapshot_fields(before: Dict[str, str], after: Dict[str, str]) -> Tuple[List[str], Dict[str, str], Dict[str, str]]:
    changed_fields = [field for field in ROOM_REGISTRY_COMPARE_FIELDS if before.get(field) != after.get(field)]
    if not changed_fields:
        return [], {}, {}
    return (
        changed_fields,
        {field: before.get(field, "") for field in changed_fields},
        {field: after.get(field, "") for field in changed_fields},
    )


def diff_room_registry_snapshots(
    previous_rows: List[Dict[str, Any]],
    current_rows: List[Dict[str, Any]],
    *,
    current_rows_normalized: bool = False,
) -> Dict[str, Any]:
    previous = {row["canonical_id"]: row for row in normalize_room_registry_snapshot_rows(previous_rows)}
    normalized_current = (
        current_rows if current_rows_normalized else normalize_room_registry_snapshot_rows(current_rows)
    )
    current = {row["canonical_id"]: row for row in normalized_current}

    previous_keys = set(previous.keys())
    current_keys = set(current.keys())
    added_ids = sorted(current_keys - previous_keys)
    removed_ids = sorted(previous_keys - current_keys)
    shared_ids = sorted(previous_keys & current_keys)

    moved: List[Dict[str, Any]] = []
    for canonical_id in shared_ids:
        before = previous[canonical_id]
        after = current[canonical_id]
        changed_fields, before_changed, after_changed = _changed_snapshot_fields(before, after)
        if not changed_fields:
            continue
        moved.append(
            {
                "canonical_id": canonical_id,
                "changed_fields": changed_fields,
                "before": before_changed,
                "after": after_changed,
            }
        )

    return {
        "added": [current[item] for item in added_ids],
        "removed": [previous[item] for item in removed_ids],
        "moved": moved,
        "counts": {
            "added": len(added_ids),
            "removed": len(removed_ids),
            "moved": len(moved),
        },
    }


def write_room_registry_snapshot_artifact(
    out_dir: Path,
    *,
    spreadsheet_id: str,
    sheet_name: str,
    registry_rows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    latest_path = out_dir / "room_registry_snapshot_latest.json"
    snapshot_dir = out_dir / "room_registry_snapshots"
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    previous_payload: Dict[str, Any] = {}
    if latest_path.exists():
        try:
            previous_payload = load_json(latest_path)
        except Exception:
            previous_payload = {}

    normalized_rows = normalize_room_registry_snapshot_rows(registry_rows)
    diff = diff_room_registry_snapshots(
        previous_payload.get("rows", []),
        normalized_rows,
        current_rows_normalized=True,
    )
    now = dt.datetime.now()
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    payload = {
        "generated_at": now.isoformat(timespec="seconds"),
        "spreadsheet_id": normalize_text(spreadsheet_id),
        "sheet_name": normalize_text(sheet_name),
        "rows": normalized_rows,
        "counts": {
            "rows": len(normalized_rows),
        },
    }

    history_path = snapshot_dir / f"room_registry_snapshot_{timestamp}.json"
    save_json_compact(history_path, payload)
    save_json_compact(latest_path, payload)
    save_json_compact(out_dir / "room_registry_snapshot_diff.json", diff)

    return {
        "latest_path": str(latest_path),
        "history_path": str(history_path),
        "has_previous_snapshot": bool(previous_payload),
        "diff": diff,
        "current": payload,
    }


def resolve_room_registry_baseline_path(args: argparse.Namespace, out_dir: Path) -> Path:
    raw = normalize_text(getattr(args, "room_registry_baseline", ""))
    if not raw:
        return out_dir / "room_registry_baseline.json"
    path = Path(raw).expanduser()
    if path.is_absolute():
        return path
    return Path.cwd() / path


def build_room_topology_map(snapshot_rows: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Counter[str] = Counter()
    for row in normalize_room_registry_snapshot_rows(snapshot_rows):
        branch = normalize_text(row.get("branch", "")).upper()
        if not branch:
            branch = "UNKNOWN"
        counts[branch] += 1
    return {branch: int(counts[branch]) for branch in sorted(counts.keys())}


def diff_room_topology(
    baseline_rows: List[Dict[str, Any]],
    current_rows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    baseline = build_room_topology_map(baseline_rows)
    current = build_room_topology_map(current_rows)
    branches = sorted(set(baseline.keys()) | set(current.keys()))
    branch_deltas: List[Dict[str, Any]] = []
    for branch in branches:
        baseline_rooms = int(baseline.get(branch, 0))
        current_rooms = int(current.get(branch, 0))
        delta = current_rooms - baseline_rooms
        if delta == 0:
            continue
        branch_deltas.append(
            {
                "branch": branch,
                "baseline_rooms": baseline_rooms,
                "current_rooms": current_rooms,
                "delta": delta,
            }
        )
    return {
        "baseline": baseline,
        "current": current,
        "branch_deltas": branch_deltas,
        "counts": {
            "branches_changed": len(branch_deltas),
        },
    }


def evaluate_room_registry_schema_lock(
    args: argparse.Namespace,
    out_dir: Path,
    current_snapshot_payload: Dict[str, Any],
) -> Dict[str, Any]:
    baseline_path = resolve_room_registry_baseline_path(args, out_dir)
    baseline_path.parent.mkdir(parents=True, exist_ok=True)

    baseline_exists = baseline_path.exists()
    force_init = bool(getattr(args, "room_registry_baseline_init", False))

    if force_init or (not baseline_exists):
        save_json(baseline_path, current_snapshot_payload)
        status = "initialized" if not baseline_exists else "reset"
        topology = diff_room_topology(
            current_snapshot_payload.get("rows", []),
            current_snapshot_payload.get("rows", []),
        )
        artifact = {
            "status": status,
            "baseline_path": str(baseline_path),
            "warning": False,
            "diff": {
                "added": [],
                "removed": [],
                "moved": [],
                "counts": {"added": 0, "removed": 0, "moved": 0},
            },
            "topology": topology,
        }
        save_json_compact(out_dir / "room_registry_schema_lock.json", artifact)
        return artifact

    baseline_payload: Dict[str, Any] = {}
    baseline_error = ""
    try:
        baseline_payload = load_json(baseline_path)
    except Exception as exc:
        baseline_error = str(exc)

    if baseline_error:
        topology = diff_room_topology([], current_snapshot_payload.get("rows", []))
        artifact = {
            "status": "baseline_read_error",
            "baseline_path": str(baseline_path),
            "warning": True,
            "error": baseline_error,
            "diff": {
                "added": [],
                "removed": [],
                "moved": [],
                "counts": {"added": 0, "removed": 0, "moved": 0},
            },
            "topology": topology,
        }
        save_json_compact(out_dir / "room_registry_schema_lock.json", artifact)
        return artifact

    diff = diff_room_registry_snapshots(
        baseline_payload.get("rows", []),
        current_snapshot_payload.get("rows", []),
    )
    topology = diff_room_topology(
        baseline_payload.get("rows", []),
        current_snapshot_payload.get("rows", []),
    )
    has_warning = any(int(diff["counts"].get(key, 0)) > 0 for key in ("added", "removed", "moved"))
    has_warning = has_warning or bool(topology.get("branch_deltas"))
    artifact = {
        "status": "checked",
        "baseline_path": str(baseline_path),
        "warning": has_warning,
        "diff": diff,
        "topology": topology,
    }
    save_json_compact(out_dir / "room_registry_schema_lock.json", artifact)
    return artifact


def build_room_registry_artifact(room_rows: Dict[int, Any]) -> Dict[str, Any]:
    by_canonical: Dict[str, Dict[str, Any]] = {}
    canonical_observations: Dict[str, List[Dict[str, Any]]] = {}
    duplicate_rows: List[Dict[str, Any]] = []
    for row_index, room in sorted(room_rows.items(), key=lambda item: item[0]):
        canonical_id = normalize_text(getattr(room, "canonical_id", "")).upper()
        branch = normalize_text(getattr(room, "branch", "")).upper()
        building = normalize_text(getattr(room, "building", "")).upper()
        room_number = normalize_text(getattr(room, "room_number", ""))
        sheet_room_no = normalize_text(getattr(room, "sheet_room_no", "")).upper() or normalize_text(room.room_no).upper()
        pms_room_no = normalize_text(getattr(room, "pms_room_no", ""))
        if not canonical_id:
            canonical_id = normalize_text(f"{branch}-{sheet_room_no}").upper()

        canonical_observations.setdefault(canonical_id, []).append(
            {
                "branch": branch,
                "building": building,
                "room_number": room_number,
                "sheet_room_no": sheet_room_no,
                "pms_room_no": pms_room_no,
                "sheet_row": row_index + 1,
            }
        )

        entry = by_canonical.get(canonical_id)
        if not entry:
            by_canonical[canonical_id] = {
                "branch": branch,
                "building": building,
                "room_number": room_number,
                "sheet_room_no": sheet_room_no,
                "canonical_id": canonical_id,
                "pms_room_no": pms_room_no,
                "sheet_rows": [row_index + 1],
                "sheet_row_first": row_index + 1,
            }
            continue
        entry["sheet_rows"].append(row_index + 1)
        if not normalize_text(entry.get("pms_room_no", "")) and pms_room_no:
            entry["pms_room_no"] = pms_room_no
        if not normalize_text(entry.get("building", "")) and building:
            entry["building"] = building
        if not normalize_text(entry.get("room_number", "")) and room_number:
            entry["room_number"] = room_number
        if not normalize_text(entry.get("sheet_room_no", "")) and sheet_room_no:
            entry["sheet_room_no"] = sheet_room_no
        duplicate_rows.append(
            {
                "canonical_id": canonical_id,
                "sheet_row": row_index + 1,
                "sheet_room_no": sheet_room_no,
            }
        )

    registry_rows = []
    for item in sorted(
        by_canonical.values(),
        key=lambda value: (value.get("canonical_id", ""), value.get("sheet_row_first", 0)),
    ):
        row = dict(item)
        row["sheet_rows"] = "|".join(str(v) for v in row.get("sheet_rows", []))
        registry_rows.append(row)

    identity_issues: List[Dict[str, str]] = []

    # Hard Rule 1: canonical -> pms_room_no must be unique.
    for canonical_id, observations in sorted(canonical_observations.items(), key=lambda item: item[0]):
        pms_values = sorted(
            {
                normalize_text(obs.get("pms_room_no", ""))
                for obs in observations
                if normalize_text(obs.get("pms_room_no", ""))
            },
            key=room_registry_sort_key,
        )
        if len(pms_values) <= 1:
            continue
        identity_issues.append(
            build_room_registry_issue(
                issue_type="PMS_CANONICAL_COLLISION",
                branch=observations[0].get("branch", ""),
                pms_room_no="|".join(pms_values),
                canonical_ids=canonical_id,
                sheet_room_nos=[obs.get("sheet_room_no", "") for obs in observations],
                sheet_rows=[str(obs.get("sheet_row", "")) for obs in observations],
            )
        )

    by_branch_pms: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for item in registry_rows:
        branch = item.get("branch", "")
        pms_room_no = item.get("pms_room_no", "")
        if not branch or not pms_room_no:
            continue
        by_branch_pms.setdefault((branch, pms_room_no), []).append(item)

    # Hard Rule 1 (reverse): branch+pms_room_no must not map to multiple canonical rooms.
    for (branch, pms_room_no), items in sorted(
        by_branch_pms.items(),
        key=lambda kv: (kv[0][0], room_registry_sort_key(kv[0][1])),
    ):
        if len(items) <= 1:
            continue
        identity_issues.append(
            build_room_registry_issue(
                issue_type="PMS_ROOM_NO_COLLISION",
                branch=branch,
                pms_room_no=pms_room_no,
                canonical_ids=[item.get("canonical_id", "") for item in items],
                sheet_room_nos=[item.get("sheet_room_no", "") for item in items],
                sheet_rows=[item.get("sheet_rows", "") for item in items],
            )
        )

    for item in registry_rows:
        branch = item.get("branch", "")
        building = item.get("building", "")
        room_number = item.get("room_number", "")
        sheet_room_no = item.get("sheet_room_no", "")
        canonical_id = item.get("canonical_id", "")
        pms_room_no = item.get("pms_room_no", "")
        sheet_rows = item.get("sheet_rows", "")

        # Hard Rule 3: only \\d{3,4} and A\\d{3,4} are allowed in the sheet.
        if not is_valid_room_registry_sheet_pattern(sheet_room_no):
            identity_issues.append(
                build_room_registry_issue(
                    issue_type="INVALID_PATTERN",
                    branch=branch,
                    pms_room_no=pms_room_no,
                    canonical_ids=canonical_id,
                    sheet_room_nos=sheet_room_no,
                    sheet_rows=sheet_rows,
                )
            )

        # Hard Rule 2: building-floor max range guard.
        max_floor = resolve_room_registry_building_max_floor(branch, building)
        floor = infer_room_floor(room_number)
        if max_floor is not None and floor is not None and floor > max_floor:
            identity_issues.append(
                build_room_registry_issue(
                    issue_type="BUILDING_RANGE_VIOLATION",
                    branch=branch,
                    pms_room_no=pms_room_no,
                    canonical_ids=canonical_id,
                    sheet_room_nos=sheet_room_no,
                    sheet_rows=sheet_rows,
                )
            )

    identity_issues = sorted(
        identity_issues,
        key=lambda row: (
            row.get("issue_type", ""),
            row.get("branch", ""),
            room_registry_sort_key(row.get("pms_room_no", "")),
            row.get("canonical_ids", ""),
        ),
    )
    issue_counts = Counter(row.get("issue_type", "") for row in identity_issues)
    pms_collision_count = int(issue_counts.get("PMS_ROOM_NO_COLLISION", 0)) + int(
        issue_counts.get("PMS_CANONICAL_COLLISION", 0)
    )

    return {
        "rows": registry_rows,
        "duplicate_rows": duplicate_rows,
        "identity_issues": identity_issues,
        "counts": {
            "canonical_rooms": len(registry_rows),
            "duplicate_room_rows": len(duplicate_rows),
            "identity_issues": len(identity_issues),
            "pms_room_no_collisions": pms_collision_count,
            "pms_canonical_collisions": int(issue_counts.get("PMS_CANONICAL_COLLISION", 0)),
            "invalid_patterns": int(issue_counts.get("INVALID_PATTERN", 0)),
            "building_range_violations": int(issue_counts.get("BUILDING_RANGE_VIOLATION", 0)),
        },
        "issue_counts": dict(issue_counts),
    }


def load_analysis_context(args: argparse.Namespace) -> Dict[str, Any]:
    spreadsheet_id = extract_sheet_id(args.spreadsheet)
    if not spreadsheet_id:
        raise AuditError(f"Invalid spreadsheet ID/URL: {args.spreadsheet}")
    access_token = get_access_token(args)
    client = GoogleSheetsReadonlyClient(access_token=access_token)

    sheet_name = args.sheet_name
    if not sheet_name:
        sheet_name = client.resolve_sheet_name_by_gid(spreadsheet_id, args.gid)

    preferred_start_row = max(int(args.start_row), 1)
    year = infer_year_from_sheet_name(sheet_name, args.year)
    matrix, date_row, date_cols = load_sheet_matrix_and_dates(
        client=client,
        spreadsheet_id=spreadsheet_id,
        sheet_name=sheet_name,
        preferred_start_row=preferred_start_row,
        year=year,
    )
    room_row_logs: List[Dict[str, Any]] = []
    room_rows = map_room_rows(
        matrix,
        date_cols,
        scan_row_start=date_row + 2,
        room_row_logs=room_row_logs,
    )

    har_records: List[HarRecord] = []
    har_index: Dict[str, HarRecord] = {}
    if args.har:
        har_records = parse_har_records(Path(args.har))
        har_index = build_har_index(har_records)

    return {
        "client": client,
        "spreadsheet_id": spreadsheet_id,
        "sheet_name": sheet_name,
        "matrix": matrix,
        "date_row": date_row,
        "date_cols": date_cols,
        "room_rows": room_rows,
        "room_row_logs": room_row_logs,
        "har_records": har_records,
        "har_index": har_index,
    }


def build_analysis_artifacts(args: argparse.Namespace, context: Dict[str, Any]) -> Dict[str, Any]:
    matrix = context["matrix"]
    date_row = context["date_row"]
    date_cols = context["date_cols"]
    room_rows = context["room_rows"]
    room_row_logs = list(context.get("room_row_logs", []))
    har_index = context["har_index"]

    blocks, scan_meta = extract_reservation_blocks(matrix, date_cols, room_rows)
    sheet_branch_scope_filter = parse_branch_scope(getattr(args, "sheet_branch_scope", ""))
    if sheet_branch_scope_filter:
        scope_set = set(sheet_branch_scope_filter)
        blocks = [
            block
            for block in blocks
            if normalize_branch_label(getattr(block, "branch", "")) in scope_set
        ]
    daily_stats = list(scan_meta.get("daily_all", []))
    daily_branch_stats = list(scan_meta.get("daily_by_branch", []))
    vac_by_room_type = calculate_vac_by_room_type(matrix, date_cols, room_rows)
    room_rows_artifact, room_type_kpi = build_room_rows_vac_artifact(
        matrix=matrix,
        date_cols=date_cols,
        room_rows=room_rows,
        room_row_logs=room_row_logs,
    )
    room_registry_artifact = build_room_registry_artifact(room_rows)
    pms_branch_map = parse_pms_branch_map(args.pms_branch_map)
    source_records = load_source_reservations(
        har_path=args.har,
        wings_file=args.wings_file,
        naver_file=args.naver_file,
        station_file=args.station_file,
        pms_file=args.pms_file,
        pms_branch_map=pms_branch_map,
    )
    filtered_source_records, pms_branch_scope = apply_pms_branch_scope_filter(
        blocks,
        source_records,
    )
    enrich_blocks_with_source_metadata(blocks, source_records)

    inventory_rows = find_inventory_rows(matrix, row_start=date_row + 2)
    station_existing = (
        extract_inventory_values_by_date(matrix, inventory_rows["STATION"], date_cols)
        if "STATION" in inventory_rows
        else None
    )
    naver_existing = (
        extract_inventory_values_by_date(matrix, inventory_rows["NAVER"], date_cols)
        if "NAVER" in inventory_rows
        else None
    )
    channel_reco = calculate_channel_recommendations(
        daily_stats=daily_stats,
        station_existing=station_existing,
        naver_existing=naver_existing,
        vac_share_limit=args.vac_share_limit,
    )
    ops_artifacts = build_ops_artifacts(
        blocks,
        report_date=args.report_date,
        report_start=args.report_start_date,
        report_end=args.report_end_date,
        client=context.get("client"),
        ops_sheet_spreadsheet=args.ops_sheet_spreadsheet,
    )
    cross_blocks, cross_sources, cross_scope = filter_cross_validation_inputs_by_report_window(
        blocks,
        filtered_source_records,
        args.report_start_date,
        args.report_end_date,
    )
    cross_issues = cross_validate_sheet_vs_sources(cross_blocks, cross_sources)
    suspect_trace = build_suspect_trace_artifact(
        cross_issues=cross_issues,
        blocks=cross_blocks,
        summary_meta={
            "summary_json": "",
            "spreadsheet_id": context["spreadsheet_id"],
            "sheet_name": context["sheet_name"],
        },
    )
    long_tail_candidates = enrich_long_tail_candidates_with_source_records(
        list(scan_meta.get("long_tail_ota_candidates", [])),
        filtered_source_records,
    )

    return {
        "blocks": blocks,
        "scan_meta": scan_meta,
        "daily_stats": daily_stats,
        "daily_branch_stats": daily_branch_stats,
        "vac_by_room_type": vac_by_room_type,
        "room_rows_artifact": room_rows_artifact,
        "room_type_kpi": room_type_kpi,
        "room_registry_artifact": room_registry_artifact,
        "source_records": filtered_source_records,
        "source_records_raw": source_records,
        "source_system_counts": Counter(r.source_system for r in source_records),
        "source_system_counts_filtered": Counter(r.source_system for r in filtered_source_records),
        "pms_branch_scope": pms_branch_scope,
        "sheet_branch_scope_filter": sheet_branch_scope_filter,
        "cross_validation_scope": cross_scope,
        "pms_branch_map": pms_branch_map,
        "inventory_rows": inventory_rows,
        "channel_reco": channel_reco,
        "issues": reconcile_sheet_vs_har(blocks, har_index) if har_index else [],
        "cross_issues": cross_issues,
        "suspect_trace": suspect_trace,
        "long_tail_candidates": long_tail_candidates,
        **ops_artifacts,
    }


def attach_room_registry_runtime_artifacts(
    args: argparse.Namespace,
    context: Dict[str, Any],
    artifacts: Dict[str, Any],
    out_dir: Path,
) -> None:
    room_registry_artifact = artifacts.get("room_registry_artifact", {})
    snapshot_artifact = write_room_registry_snapshot_artifact(
        out_dir,
        spreadsheet_id=context.get("spreadsheet_id", ""),
        sheet_name=context.get("sheet_name", ""),
        registry_rows=room_registry_artifact.get("rows", []),
    )
    schema_lock_artifact = evaluate_room_registry_schema_lock(
        args,
        out_dir,
        snapshot_artifact.get("current", {}),
    )

    artifacts["room_registry_snapshot_artifact"] = snapshot_artifact
    artifacts["room_registry_schema_lock_artifact"] = schema_lock_artifact
    room_registry_artifact["snapshot_diff"] = snapshot_artifact.get("diff", {})
    room_registry_artifact["schema_lock"] = schema_lock_artifact

    snapshot_counts = snapshot_artifact.get("diff", {}).get("counts", {})
    schema_warning = 1 if bool(schema_lock_artifact.get("warning", False)) else 0
    topology_counts = schema_lock_artifact.get("topology", {}).get("counts", {})
    room_registry_artifact.setdefault("counts", {})
    room_registry_artifact["counts"]["snapshot_added"] = int(snapshot_counts.get("added", 0))
    room_registry_artifact["counts"]["snapshot_removed"] = int(snapshot_counts.get("removed", 0))
    room_registry_artifact["counts"]["snapshot_moved"] = int(snapshot_counts.get("moved", 0))
    room_registry_artifact["counts"]["schema_lock_warnings"] = schema_warning
    room_registry_artifact["counts"]["topology_branch_changes"] = int(
        topology_counts.get("branches_changed", 0)
    )


def write_analysis_outputs(out_dir: Path, artifacts: Dict[str, Any]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    write_blocks_csv(out_dir / "reservation_blocks.csv", artifacts["blocks"])
    write_daily_csv(out_dir / "vac_daily.csv", artifacts["daily_stats"])
    write_daily_csv(out_dir / "occupancy_daily_by_branch.csv", artifacts["daily_branch_stats"])
    write_room_type_vac_csv(out_dir / "vac_by_room_type.csv", artifacts["vac_by_room_type"])
    write_room_rows_csv(out_dir / "room_rows.csv", artifacts["room_rows_artifact"])
    write_room_registry_csv(out_dir / "room_registry.csv", artifacts["room_registry_artifact"]["rows"])
    write_room_identity_issues_csv(
        out_dir / "room_identity_issues.csv", artifacts["room_registry_artifact"]["identity_issues"]
    )
    write_recommendations_csv(out_dir / "channel_recommendations.csv", artifacts["channel_reco"])
    write_cross_validation_csv(out_dir / "cross_validation_issues.csv", artifacts["cross_issues"])
    write_source_reservations_csv(out_dir / "source_reservations.csv", artifacts["source_records"])
    write_source_reservations_csv(out_dir / "source_reservations_raw.csv", artifacts["source_records_raw"])
    write_pms_branch_scope_exclusions_csv(
        out_dir / "pms_branch_scope_exclusions.csv",
        artifacts["pms_branch_scope"].get("excluded_rows", []),
    )
    save_json(out_dir / "suspect_reservations_trace.json", artifacts["suspect_trace"])
    write_suspect_trace_csv(out_dir / "suspect_reservations_trace.csv", artifacts["suspect_trace"])
    write_long_tail_ota_candidates_csv(
        out_dir / "long_tail_ota_candidates.csv", artifacts["long_tail_candidates"]
    )
    save_json(out_dir / "long_tail_ota_candidates.json", artifacts["long_tail_candidates"])
    write_ops_outputs(out_dir, artifacts)


def build_analysis_summary(
    args: argparse.Namespace,
    context: Dict[str, Any],
    artifacts: Dict[str, Any],
) -> Dict[str, Any]:
    scan_meta = artifacts["scan_meta"]
    long_tail_candidates = artifacts["long_tail_candidates"]
    return {
        "input": {
            "spreadsheet_id": context["spreadsheet_id"],
            "sheet_name": context["sheet_name"],
            "start_row": args.start_row,
            "date_row": context["date_row"] + 1,
            "room_rows_count": len(context["room_rows"]),
            "date_columns_count": len(context["date_cols"]),
            "har_records_count": len(context["har_records"]),
            "source_reservations_count_raw": len(artifacts["source_records_raw"]),
            "source_reservations_count": len(artifacts["source_records"]),
            "source_system_counts": dict(artifacts["source_system_counts"]),
            "source_system_counts_filtered": dict(artifacts["source_system_counts_filtered"]),
            "pms_branch_map": artifacts["pms_branch_map"],
            "pms_branch_scope": artifacts["pms_branch_scope"],
            "sheet_branch_scope_filter": artifacts.get("sheet_branch_scope_filter", []),
            "cross_validation_scope": artifacts.get("cross_validation_scope", {}),
        },
        "counts": {
            "reservation_blocks": len(artifacts["blocks"]),
            "daily_rows": len(artifacts["daily_stats"]),
            "daily_branch_rows": len(artifacts["daily_branch_stats"]),
            "room_registry_rows": int(artifacts["room_registry_artifact"]["counts"].get("canonical_rooms", 0)),
            "room_registry_duplicates": int(
                artifacts["room_registry_artifact"]["counts"].get("duplicate_room_rows", 0)
            ),
            "room_identity_issues": int(
                artifacts["room_registry_artifact"]["counts"].get("identity_issues", 0)
            ),
            "room_pms_collisions": int(
                artifacts["room_registry_artifact"]["counts"].get("pms_room_no_collisions", 0)
            ),
            "room_invalid_patterns": int(
                artifacts["room_registry_artifact"]["counts"].get("invalid_patterns", 0)
            ),
            "room_building_range_violations": int(
                artifacts["room_registry_artifact"]["counts"].get("building_range_violations", 0)
            ),
            "room_snapshot_added": int(
                artifacts["room_registry_artifact"]["counts"].get("snapshot_added", 0)
            ),
            "room_snapshot_removed": int(
                artifacts["room_registry_artifact"]["counts"].get("snapshot_removed", 0)
            ),
            "room_snapshot_moved": int(
                artifacts["room_registry_artifact"]["counts"].get("snapshot_moved", 0)
            ),
            "room_schema_lock_warnings": int(
                artifacts["room_registry_artifact"]["counts"].get("schema_lock_warnings", 0)
            ),
            "room_topology_branch_changes": int(
                artifacts["room_registry_artifact"]["counts"].get("topology_branch_changes", 0)
            ),
            "reconciliation_issues": len(artifacts["issues"]),
            "cross_validation_issues": len(artifacts["cross_issues"]),
            "suspect_reservations": int(artifacts["suspect_trace"].get("count", 0)),
            "pms_branch_excluded": int(
                artifacts["pms_branch_scope"].get("excluded_pms_records", 0)
            ),
            "orderlist_rows": len(artifacts["orderlist_artifact"]["rows"]),
            "arrival_rows": len(artifacts["arrival_artifact"]["rows"]),
        },
        "scan_v2": {
            "branch_split_row_fallback": BRANCH_SPLIT_ROW + 1,
            "branch_assignment_mode": scan_meta.get("branch_assignment_mode", ""),
            "branch_keys": scan_meta.get("branch_keys", []),
            "branch_markers": scan_meta.get("branch_markers", []),
            "branch_segments": scan_meta.get("branch_segments", []),
            "branch_room_totals": scan_meta.get("branch_room_totals", {}),
            "total_rooms_detected": scan_meta.get("total_rooms_detected"),
            "total_rooms_expected": scan_meta.get("total_rooms_expected"),
            "chunk_mode_enabled": scan_meta.get("chunk_mode_enabled", False),
            "error_counts": scan_meta.get("error_counts", {}),
            "errors": scan_meta.get("errors", []),
            "long_tail_ota_candidate_count": len(long_tail_candidates),
            "long_tail_ota_counts": scan_meta.get("long_tail_ota_counts", {}),
            "room_type_kpi": artifacts.get("room_type_kpi", {}),
            "room_registry": artifacts["room_registry_artifact"],
            "room_registry_snapshot": artifacts.get("room_registry_snapshot_artifact", {}),
            "room_registry_schema_lock": artifacts.get("room_registry_schema_lock_artifact", {}),
        },
        "inventory_rows_found": artifacts["inventory_rows"],
        "derived_reports": {
            **build_ops_summary(artifacts),
        },
        "issues": artifacts["issues"],
        "cross_validation_issues": artifacts["cross_issues"],
        "suspect_reservations_trace": artifacts["suspect_trace"],
        "pms_branch_scope": artifacts["pms_branch_scope"],
    }

def apply_no_proxy_if_requested(args: argparse.Namespace) -> None:
    if bool(getattr(args, "_no_proxy_applied", False)):
        return
    if not bool(getattr(args, "no_proxy", False)):
        return
    removed = []
    for key in PROXY_ENV_KEYS:
        if key in os.environ:
            os.environ.pop(key, None)
            removed.append(key)
    # Keep the current process in direct mode.
    os.environ["NO_PROXY"] = "*"
    os.environ["no_proxy"] = "*"
    if removed:
        print(f"[proxy] disabled env proxies: {', '.join(sorted(removed))}")
    else:
        print("[proxy] disabled env proxies: none")
    setattr(args, "_no_proxy_applied", True)


def resolve_client_secret(
    args: Optional[argparse.Namespace] = None,
    token: Optional[Dict[str, Any]] = None,
) -> str:
    if args is not None:
        value = str(getattr(args, "client_secret", "") or "").strip()
        if value:
            return value
    env_value = str(os.getenv("GOOGLE_CLIENT_SECRET", "") or "").strip()
    if env_value:
        return env_value
    if token:
        value = str(token.get("client_secret", "") or "").strip()
        if value:
            return value
    return ""


def token_is_valid(token: Dict[str, Any], buffer_seconds: int = 60) -> bool:
    access = token.get("access_token")
    expires_at = token.get("expires_at")
    if not access:
        return False
    if not expires_at:
        return True
    try:
        return int(expires_at) > int(dt.datetime.now().timestamp()) + buffer_seconds
    except (TypeError, ValueError):
        return False


def get_access_token(args: argparse.Namespace) -> str:
    if args.access_token:
        return args.access_token
    env_token = os.getenv("GOOGLE_ACCESS_TOKEN")
    if env_token:
        return env_token
    token_file = Path(args.token_file)
    if not token_file.exists():
        raise AuditError(
            f"?묎렐 ?좏겙???놁뒿?덈떎. --access-token ?먮뒗 {args.token_file} ?뚯씪???꾩슂?⑸땲??"
        )
    token = load_json(token_file)
    if token_is_valid(token):
        return token["access_token"]

    refresh_token_val = token.get("refresh_token")
    if not refresh_token_val:
        raise AuditError(
            "?좏겙??留뚮즺?섏뿀怨?refresh_token???놁뒿?덈떎. oauth-start/oauth-finish瑜??ㅼ떆 ?ㅽ뻾?섏꽭??"
        )
    client_secret = resolve_client_secret(args=args, token=token)
    refreshed = refresh_access_token(
        args.client_id, refresh_token_val, client_secret=client_secret
    )
    merged = dict(token)
    merged.update(refreshed)
    if "refresh_token" not in merged:
        merged["refresh_token"] = refresh_token_val
    if client_secret:
        merged["client_secret"] = client_secret
    save_json(token_file, merged)
    return merged["access_token"]


def command_oauth_start(args: argparse.Namespace) -> int:
    verifier = generate_pkce_verifier()
    state = secrets.token_urlsafe(24)
    url = build_google_oauth_url(
        client_id=args.client_id,
        redirect_uri=args.redirect_uri,
        scope=args.scope,
        verifier=verifier,
        state=state,
    )
    payload = {
        "client_id": args.client_id,
        "redirect_uri": args.redirect_uri,
        "scope": args.scope,
        "code_verifier": verifier,
        "state": state,
        "created_at": dt.datetime.now().isoformat(),
    }
    save_json(Path(args.pkce_file), payload)
    print("[1] ?꾨옒 URL??釉뚮씪?곗??먯꽌 ?댁뼱 濡쒓렇???숈쓽?섏꽭??")
    print(url)
    print(
        f"[2] 由щ떎?대젆??URL??code=... 媛믪쓣 蹂듭궗?댁꽌 `oauth-finish --code \"...\"` ?ㅽ뻾?섏꽭??\n"
        f"PKCE ?꾩떆?뚯씪: {args.pkce_file}"
    )
    return 0


def command_oauth_finish(args: argparse.Namespace) -> int:
    pkce_file = Path(args.pkce_file)
    if not pkce_file.exists():
        raise AuditError(f"PKCE ?뚯씪???놁뒿?덈떎: {pkce_file}")
    pending = load_json(pkce_file)
    client_secret = resolve_client_secret(args=args, token=pending)
    token = exchange_auth_code_for_token(
        client_id=pending["client_id"],
        code=args.code,
        verifier=pending["code_verifier"],
        redirect_uri=pending["redirect_uri"],
        client_secret=client_secret,
    )
    token["client_id"] = pending["client_id"]
    token["scope"] = pending.get("scope", DEFAULT_SCOPE)
    if client_secret:
        token["client_secret"] = client_secret
    save_json(Path(args.token_file), token)
    print(f"?좏겙 ????꾨즺: {args.token_file}")
    return 0


def command_oauth_auto(args: argparse.Namespace) -> int:
    token = oauth_auto_issue_token(
        client_id=args.client_id,
        redirect_uri=args.redirect_uri,
        scope=args.scope,
        token_file=Path(args.token_file),
        client_secret=resolve_client_secret(args=args),
        timeout_sec=args.oauth_timeout_sec,
        open_browser=not args.no_browser,
    )
    print(f"?먮룞 OAuth ?좏겙 ????꾨즺: {args.token_file}")
    expires_at = token.get("expires_at")
    if expires_at:
        try:
            expire_dt = dt.datetime.fromtimestamp(int(expires_at))
            print(f"- access_token 留뚮즺?쒓컖: {expire_dt.isoformat(sep=' ', timespec='seconds')}")
        except (TypeError, ValueError, OSError):
            pass
    return 0


def command_analyze(args: argparse.Namespace) -> int:
    apply_no_proxy_if_requested(args)
    analysis_context = load_analysis_context(args)
    artifacts = build_analysis_artifacts(args, analysis_context)
    out_dir = Path(args.out_dir)
    attach_room_registry_runtime_artifacts(args, analysis_context, artifacts, out_dir)
    write_analysis_outputs(out_dir, artifacts)
    summary = build_analysis_summary(args, analysis_context, artifacts)
    save_json(out_dir / "summary.json", summary)

    print("遺꾩꽍 ?꾨즺")
    print(f"- Reservation blocks: {len(artifacts['blocks'])}")
    print(f"- Occupancy dates (ALL): {len(artifacts['daily_stats'])}")
    print(f"- Occupancy rows (branch): {len(artifacts['daily_branch_stats'])}")
    print(f"- Reconciliation issues: {len(artifacts['issues'])}")
    print(
        "- Cross validation source records:"
        f" raw={len(artifacts['source_records_raw'])},"
        f" filtered={len(artifacts['source_records'])}"
    )
    print(
        "- PMS branch scope:"
        f" excluded={int(artifacts['pms_branch_scope'].get('excluded_pms_records', 0))},"
        f" scope={artifacts['pms_branch_scope'].get('sheet_branch_scope', [])}"
    )
    print(f"- Cross validation issues: {len(artifacts['cross_issues'])}")
    print(f"- Suspect reservations: {int(artifacts['suspect_trace'].get('count', 0))}")
    room_type_kpi = artifacts.get("room_type_kpi", {})
    room_registry_counts = artifacts.get("room_registry_artifact", {}).get("counts", {})
    print(
        "- RoomType KPI:"
        f" unknown_vac={room_type_kpi.get('unknown_total_vac', 0)},"
        f" unknown_actual_room_vac={room_type_kpi.get('unknown_actual_room_vac', 0)},"
        f" vac_total={room_type_kpi.get('vac_total', 0)}"
    )
    print(
        "- Room Registry:"
        f" canonical_rooms={room_registry_counts.get('canonical_rooms', 0)},"
        f" duplicate_rows={room_registry_counts.get('duplicate_room_rows', 0)},"
        f" pms_collisions={room_registry_counts.get('pms_room_no_collisions', 0)},"
        f" invalid_patterns={room_registry_counts.get('invalid_patterns', 0)},"
        f" building_range_violations={room_registry_counts.get('building_range_violations', 0)}"
    )
    snapshot_counts = (
        artifacts.get("room_registry_snapshot_artifact", {})
        .get("diff", {})
        .get("counts", {})
    )
    print(
        "- Room Registry Snapshot:"
        f" added={int(snapshot_counts.get('added', 0))},"
        f" removed={int(snapshot_counts.get('removed', 0))},"
        f" moved={int(snapshot_counts.get('moved', 0))}"
    )
    schema_lock = artifacts.get("room_registry_schema_lock_artifact", {})
    topology_deltas = schema_lock.get("topology", {}).get("branch_deltas", [])
    if topology_deltas:
        compact = ", ".join(
            f"{item.get('branch', '')}:{int(item.get('delta', 0)):+d}"
            for item in topology_deltas[:8]
        )
        print(f"- Room Topology Delta: {compact}")
    if bool(schema_lock.get("warning", False)):
        schema_counts = schema_lock.get("diff", {}).get("counts", {})
        print(
            "[WARN] Room registry baseline diff detected:"
            f" added={int(schema_counts.get('added', 0))},"
            f" removed={int(schema_counts.get('removed', 0))},"
            f" moved={int(schema_counts.get('moved', 0))},"
            f" baseline={schema_lock.get('baseline_path', '')}"
        )
    print(
        "- Derived reports:"
        f" orderlist={len(artifacts['orderlist_artifact']['rows'])},"
        f" arrival={len(artifacts['arrival_artifact']['rows'])}"
    )
    print(
        "- Ops sheet packets:"
        f" orderlist_tabs={len(artifacts['ops_sheet_bundle']['orderlist_packets'])},"
        f" arrival_tabs={len(artifacts['ops_sheet_bundle']['arrival_packets'])}"
    )
    print(f"- Output dir: {out_dir}")
    return 0


def command_ops_artifacts(args: argparse.Namespace) -> int:
    apply_no_proxy_if_requested(args)
    source_mode = "blocks_csv"
    context: Dict[str, Any] = {}
    if normalize_text(args.blocks_csv):
        blocks = load_blocks_csv(Path(args.blocks_csv))
    else:
        source_mode = "live_sheet"
        context = load_analysis_context(args)
        blocks, _scan_meta = extract_reservation_blocks(
            context["matrix"], context["date_cols"], context["room_rows"]
        )
    artifacts = build_ops_artifacts(
        blocks,
        report_date=args.report_date,
        report_start=args.report_start_date,
        report_end=args.report_end_date,
        client=context.get("client"),
        ops_sheet_spreadsheet=args.ops_sheet_spreadsheet,
    )
    out_dir = Path(args.out_dir)
    write_ops_outputs(out_dir, artifacts)
    summary = {
        "input": {
            "source_mode": source_mode,
            "blocks_csv": normalize_text(args.blocks_csv),
            "spreadsheet_id": context.get("spreadsheet_id", ""),
            "sheet_name": context.get("sheet_name", ""),
            "reservation_blocks": len(blocks),
        },
        "derived_reports": build_ops_summary(artifacts),
    }
    save_json(out_dir / "ops_summary.json", summary)

    print("ops artifacts complete")
    print(f"- Source mode: {source_mode}")
    print(f"- Reservation blocks: {len(blocks)}")
    print(f"- Orderlist rows: {len(artifacts['orderlist_artifact']['rows'])}")
    print(f"- Arrival rows: {len(artifacts['arrival_artifact']['rows'])}")
    print(
        "- Ops sheet packets:"
        f" orderlist_tabs={len(artifacts['ops_sheet_bundle']['orderlist_packets'])},"
        f" arrival_tabs={len(artifacts['ops_sheet_bundle']['arrival_packets'])}"
    )
    print(f"- Output dir: {out_dir}")
    return 0


def command_trace_blocks(args: argparse.Namespace) -> int:
    blocks_path = Path(args.blocks_csv)
    blocks = load_blocks_csv(blocks_path)
    summary_meta = load_trace_summary_metadata(
        blocks_path=blocks_path,
        summary_path=Path(args.summary_json) if normalize_text(args.summary_json) else None,
    )
    target_date = parse_any_date(args.date) if normalize_text(args.date) else None
    if normalize_text(args.date) and target_date is None:
        raise AuditError(f"--date must be YYYY-MM-DD: {args.date}")
    matches = [
        block
        for block in blocks
        if block_matches_trace_filters(
            block,
            reservation_key=normalize_text(args.reservation_key),
            reservation_no=normalize_text(args.reservation_no),
            room_no=normalize_text(args.room_no),
            target_date=target_date,
        )
    ]
    packets = [
        build_trace_packet(block, summary_meta)
        for block in matches[: max(int(args.limit), 1)]
    ]
    print(
        json.dumps(
            {
                "count": len(matches),
                "returned": len(packets),
                "filters": {
                    "reservation_key": normalize_text(args.reservation_key),
                    "reservation_no": normalize_text(args.reservation_no),
                    "room_no": normalize_text(args.room_no),
                    "date": target_date.isoformat() if target_date else "",
                    "blocks_csv": str(blocks_path),
                    "summary_json": summary_meta.get("summary_json", ""),
                },
                "matches": packets,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def load_trace_summary_metadata(
    *,
    blocks_path: Path,
    summary_path: Optional[Path],
) -> Dict[str, str]:
    candidates: List[Path] = []
    if summary_path is not None:
        candidates.append(summary_path)
    default_summary = blocks_path.with_name("summary.json")
    if default_summary not in candidates:
        candidates.append(default_summary)
    for candidate in candidates:
        if not candidate.exists():
            continue
        data = json.loads(candidate.read_text(encoding="utf-8-sig"))
        input_meta = data.get("input", {})
        return {
            "summary_json": str(candidate),
            "spreadsheet_id": normalize_text(input_meta.get("spreadsheet_id", "")),
            "sheet_name": normalize_text(input_meta.get("sheet_name", "")),
        }
    return {"summary_json": "", "spreadsheet_id": "", "sheet_name": ""}


def block_matches_trace_filters(
    block: ReservationBlock,
    *,
    reservation_key: str,
    reservation_no: str,
    room_no: str,
    target_date: Optional[dt.date],
) -> bool:
    if reservation_key and normalize_text(block.reservation_key) != reservation_key:
        return False
    if reservation_no and normalize_text(block.reservation_no) != reservation_no:
        return False
    if room_no and normalize_text(block.room_no) != room_no:
        return False
    if target_date is not None:
        if not block.checkin or not block.checkout:
            return False
        if not (block.checkin <= target_date < block.checkout):
            return False
    return True


def build_trace_packet(block: ReservationBlock, summary_meta: Dict[str, str]) -> Dict[str, Any]:
    source_columns_one_based = [col + 1 for col in block.source_columns]
    start_col_one_based = block.start_col + 1
    end_col_one_based = block.end_col + 1
    start_col_a1 = col_one_based_to_a1(start_col_one_based)
    end_col_a1 = col_one_based_to_a1(end_col_one_based)
    sheet_name = summary_meta.get("sheet_name", "")
    safe_sheet_name = ""
    if sheet_name:
        escaped_sheet_name = sheet_name.replace("'", "''")
        safe_sheet_name = f"'{escaped_sheet_name}'"
    row_one_based = block.row + 1
    sheet_range_a1 = ""
    if safe_sheet_name:
        sheet_range_a1 = f"{safe_sheet_name}!{start_col_a1}{row_one_based}:{end_col_a1}{row_one_based}"
    return {
        "spreadsheet_id": summary_meta.get("spreadsheet_id", ""),
        "sheet_name": sheet_name,
        "row": row_one_based,
        "room_no": block.room_no,
        "room_type": block.room_type,
        "reservation_no": block.reservation_no or "",
        "reservation_key": block.reservation_key or "",
        "branch": block.branch,
        "channel": block.channel,
        "checkin": block.checkin.isoformat() if block.checkin else "",
        "checkout": block.checkout.isoformat() if block.checkout else "",
        "nights": block.nights,
        "start_col": start_col_one_based,
        "end_col": end_col_one_based,
        "start_col_a1": start_col_a1,
        "end_col_a1": end_col_a1,
        "source_columns": source_columns_one_based,
        "source_columns_a1": [col_one_based_to_a1(col) for col in source_columns_one_based],
        "sheet_range_a1": sheet_range_a1,
        "note_head": normalize_text(block.note)[:120],
        "nationality_nights": normalize_text(block.nationality_nights),
    }


def command_analyze_current(args: argparse.Namespace) -> int:
    apply_no_proxy_if_requested(args)
    try:
        _ = get_access_token(args)
    except AuditError as exc:
        text = str(exc)
        recoverable_markers = [
            "?묎렐 ?좏겙???놁뒿?덈떎",
            "refresh_token???놁뒿?덈떎",
            "OAuth token refresh ?ㅽ뙣",
        ]
        if not any(marker in text for marker in recoverable_markers):
            raise
        print("[OAuth] ?좏슚???좏겙???놁뼱 ?먮룞 諛쒓툒???쒖옉?⑸땲??")
        oauth_auto_issue_token(
            client_id=args.client_id,
            redirect_uri=args.redirect_uri,
            scope=args.scope,
            token_file=Path(args.token_file),
            client_secret=resolve_client_secret(args=args),
            timeout_sec=args.oauth_timeout_sec,
            open_browser=not args.no_browser,
        )
    return command_analyze(args)


def add_analyze_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--spreadsheet", default=DEFAULT_SHEET_ID)
    parser.add_argument("--sheet-name", default=DEFAULT_SHEET_NAME)
    parser.add_argument("--gid", type=int, default=DEFAULT_SHEET_GID)
    parser.add_argument("--start-row", type=int, default=1)
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--har", default="")
    parser.add_argument("--wings-file", default="")
    parser.add_argument("--naver-file", default="")
    parser.add_argument("--station-file", default="")
    parser.add_argument("--pms-file", default="")
    parser.add_argument(
        "--pms-branch-map",
        default="",
        help="PMS 지점 맵핑 (예: 91=COEX,92=GANGNAM,93=BRANCH_THE_SEOLLEUNG)",
    )
    parser.add_argument(
        "--sheet-branch-scope",
        default="",
        help="시트 블록 지점 범위 필터 (예: GANGNAM 또는 COEX,GANGNAM)",
    )
    parser.add_argument("--out-dir", default="output")
    parser.add_argument("--vac-share-limit", type=int, default=2)
    parser.add_argument("--report-date", default="")
    parser.add_argument("--report-start-date", default="")
    parser.add_argument("--report-end-date", default="")
    parser.add_argument("--ops-sheet-spreadsheet", default="")
    parser.add_argument(
        "--room-registry-baseline",
        default="room_registry_baseline.json",
        help="Room registry schema lock baseline JSON 경로",
    )
    parser.add_argument(
        "--room-registry-baseline-init",
        action="store_true",
        help="현재 room registry를 baseline으로 저장(기존 baseline 덮어씀)",
    )
    parser.add_argument("--access-token", default="")
    parser.add_argument("--token-file", default=DEFAULT_TOKEN_FILE)
    parser.add_argument("--client-id", default=DEFAULT_CLIENT_ID)
    parser.add_argument("--client-secret", default="")
    parser.add_argument("--no-proxy", action="store_true")


def add_ops_artifact_arguments(parser: argparse.ArgumentParser) -> None:
    add_analyze_arguments(parser)
    parser.add_argument("--blocks-csv", default="")


def add_trace_block_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--blocks-csv", default="output/reservation_blocks.csv")
    parser.add_argument("--summary-json", default="")
    parser.add_argument("--reservation-key", default="")
    parser.add_argument("--reservation-no", default="")
    parser.add_argument("--room-no", default="")
    parser.add_argument("--date", default="")
    parser.add_argument("--limit", type=int, default=20)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="예약시트 읽기 전용 분석 모듈 (NAVER/STATION/VAC/대조 리포트)"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    oauth_start = sub.add_parser("oauth-start", help="Google OAuth URL 생성(PKCE)")
    oauth_start.add_argument("--client-id", default=DEFAULT_CLIENT_ID)
    oauth_start.add_argument("--redirect-uri", default=DEFAULT_REDIRECT_URI)
    oauth_start.add_argument("--scope", default=DEFAULT_SCOPE)
    oauth_start.add_argument("--pkce-file", default=DEFAULT_PKCE_FILE)
    oauth_start.set_defaults(func=command_oauth_start)

    oauth_finish = sub.add_parser("oauth-finish", help="OAuth code를 token으로 교환")
    oauth_finish.add_argument("--code", required=True, help="리다이렉트 URL의 code 값")
    oauth_finish.add_argument("--pkce-file", default=DEFAULT_PKCE_FILE)
    oauth_finish.add_argument("--token-file", default=DEFAULT_TOKEN_FILE)
    oauth_finish.add_argument("--client-secret", default="")
    oauth_finish.set_defaults(func=command_oauth_finish)

    oauth_auto = sub.add_parser(
        "oauth-auto", help="로컬 콜백 서버로 OAuth 토큰 자동 발급"
    )
    oauth_auto.add_argument("--client-id", default=DEFAULT_CLIENT_ID)
    oauth_auto.add_argument("--redirect-uri", default=DEFAULT_REDIRECT_URI)
    oauth_auto.add_argument("--scope", default=DEFAULT_SCOPE)
    oauth_auto.add_argument("--token-file", default=DEFAULT_TOKEN_FILE)
    oauth_auto.add_argument("--client-secret", default="")
    oauth_auto.add_argument("--oauth-timeout-sec", type=int, default=240)
    oauth_auto.add_argument("--no-browser", action="store_true")
    oauth_auto.set_defaults(func=command_oauth_auto)

    analyze = sub.add_parser("analyze", help="시트 + HAR 분석 실행")
    add_analyze_arguments(analyze)
    analyze.set_defaults(func=command_analyze)

    analyze_current = sub.add_parser(
        "analyze-current",
        help="토큰 자동 발급(필요시) + 현재 시트 분석",
    )
    add_analyze_arguments(analyze_current)
    analyze_current.add_argument("--redirect-uri", default=DEFAULT_REDIRECT_URI)
    analyze_current.add_argument("--scope", default=DEFAULT_SCOPE)
    analyze_current.add_argument("--oauth-timeout-sec", type=int, default=240)
    analyze_current.add_argument("--no-browser", action="store_true")
    analyze_current.set_defaults(func=command_analyze_current)

    ops_artifacts = sub.add_parser(
        "ops-artifacts",
        help="ReservationBlock 기반 오더리스트/어라이벌 작성 모듈",
    )
    add_ops_artifact_arguments(ops_artifacts)
    ops_artifacts.set_defaults(func=command_ops_artifacts)

    trace_blocks = sub.add_parser(
        "trace-blocks",
        help="ReservationBlock CSV에서 시트 추적 좌표를 출력",
    )
    add_trace_block_arguments(trace_blocks)
    trace_blocks.set_defaults(func=command_trace_blocks)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except AuditError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 2
    except requests.RequestException as exc:
        print(f"[ERROR] ?ㅽ듃?뚰겕 ?붿껌 ?ㅽ뙣: {exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
