#!/usr/bin/env python
from __future__ import annotations

import sys

# Prevent creating __pycache__ inside the extension folder.
sys.dont_write_bytecode = True

import argparse
import datetime as dt
import hashlib
import json
import re
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter

from src.domain.sync_policy import (
    APPLY_BLOCKING_STATION_WARNING_CODES,
    APPLY_BLOCKING_VALIDATION_WARN_CODES,
    DEFAULT_NAVER_API_BASE,
    DEFAULT_NAVER_BUSINESS_ID,
    DEFAULT_NAVER_ROOM_IDS,
    DEFAULT_STATION_API_BASE,
    DEFAULT_STATION_BRANCH_ID,
    DEFAULT_STATION_ROOM_IDS,
    PROVIDER_TARGET_MAX,
)
from src.domain.inventory_planner import build_inventory_planner_summary
from src.domain.audit_engine import build_ota_pms_anomaly_report
from src.io.sheet_loader import load_sheet_matrix_and_dates
from src.ota.adapters import NaverPartnerAdapter, NaverPartnerAdapterConfig
from src.ota.base import OTAAdapterError
from src.channel_executors import NaverExecutor, StationExecutor
from src.core_bridge.allocation_bridge import (
    allocate_room_units as bridge_allocate_room_units,
    allocate_room_units_flexible as bridge_allocate_room_units_flexible,
)
from src.core_bridge.reconciliation_bridge import (
    build_provider_reconciliation as bridge_build_provider_reconciliation,
    summarize_naver_actual_units_by_date as bridge_summarize_naver_actual_units_by_date,
    summarize_station_actual_units_by_date as bridge_summarize_station_actual_units_by_date,
)
from src.ota.adapters import (
    AgodaAdapter,
    AgodaAdapterConfig,
    AirbnbAdapter,
    AirbnbAdapterConfig,
    BookingAdapter,
    BookingAdapterConfig,
    TripAdapter,
    TripAdapterConfig,
)
from reservation_sheet_audit import (
    AuditError,
    DEFAULT_CLIENT_ID,
    DEFAULT_SHEET_GID,
    DEFAULT_SHEET_ID,
    DEFAULT_SHEET_NAME,
    DEFAULT_START_ROW,
    DEFAULT_TOKEN_FILE,
    GoogleSheetsReadonlyClient,
    SheetMatrix,
    extract_inventory_values_by_date,
    extract_sheet_id,
    find_inventory_rows,
    get_access_token,
    infer_year_from_sheet_name,
    parse_source_reservations_from_har,
    normalize_text,
)
from src.io.har_cache import load_har_entries as load_cached_har_entries

DEFAULT_HAR_HEADER_NAMES = {
    "cookie",
    "authorization",
    "x-csrf-token",
    "x-xsrf-token",
    "x-requested-with",
    "origin",
    "referer",
    "x-booking-naver-role",
}

DROP_HEADER_NAMES = {
    "content-length",
    "host",
    "accept-encoding",
    "connection",
}

CLOSED_TEXTS = {
    "closed",
    "close",
    "soldout",
    "off",
    "x",
    "닫음",
    "마감",
}

def parse_iso_date(value: str) -> dt.date:
    try:
        return dt.date.fromisoformat(str(value))
    except Exception as exc:  # noqa: BLE001
        raise AuditError(f"Invalid date: {value}") from exc


def parse_optional_iso_date(value: str) -> Optional[dt.date]:
    text = str(value or "").strip()
    if not text:
        return None
    return parse_iso_date(text)


def parse_id_list(value: str, fallback: List[str]) -> List[str]:
    text = str(value or "").strip()
    if not text:
        return list(fallback)
    out = []
    for token in text.split(","):
        token = token.strip()
        if token:
            out.append(token)
    if not out:
        return list(fallback)
    return out


def parse_file_list(value: str) -> List[str]:
    text = str(value or "").strip()
    if not text:
        return []
    out: List[str] = []
    for token in re.split(r"[\n,]+", text):
        item = str(token or "").strip()
        if item:
            out.append(item)
    return out


def build_ota_har_source_summary(
    session: requests.Session,
    har_paths: List[str],
    range_start: str,
    range_end: str,
) -> Dict[str, Any]:
    if not har_paths:
        return {"enabled": False, "providers": {}, "issues": []}

    provider_builders = {
        "BOOKING": lambda: BookingAdapter(session, BookingAdapterConfig(wings_har_paths=har_paths)),
        "AGODA": lambda: AgodaAdapter(session, AgodaAdapterConfig(wings_har_paths=har_paths)),
        "TRIP": lambda: TripAdapter(session, TripAdapterConfig(wings_har_paths=har_paths)),
        "AIRBNB": lambda: AirbnbAdapter(session, AirbnbAdapterConfig(wings_har_paths=har_paths)),
    }
    providers: Dict[str, Any] = {}
    issues: List[Dict[str, str]] = []
    for provider, builder in provider_builders.items():
        try:
            adapter = builder()
            reservations = adapter.fetch_reservations(range_start, range_end)
            changes = adapter.fetch_changes(range_start)
            canceled = adapter.cancelled_reservations(range_start, range_end)
            inventory = adapter.get_inventory(range_start, range_end)
            providers[provider] = {
                "reservation_count": len(reservations),
                "change_count": len(changes),
                "canceled_count": len(canceled),
                "inventory_count": len(inventory),
            }
        except Exception as exc:  # noqa: BLE001
            providers[provider] = {
                "reservation_count": 0,
                "change_count": 0,
                "canceled_count": 0,
                "inventory_count": 0,
            }
            issues.append(
                {
                    "provider": provider,
                    "code": "OTA_ADAPTER_READ_FAILED",
                    "message": str(exc),
                }
            )

    return {
        "enabled": True,
        "har_paths": har_paths,
        "providers": providers,
        "issues": issues,
    }


def build_pms_har_source_summary(
    har_paths: List[str],
    range_start: str,
    range_end: str,
) -> Dict[str, Any]:
    if not har_paths:
        return {"enabled": False, "providers": {}, "issues": []}

    start_day = parse_iso_date(range_start)
    end_day = parse_iso_date(range_end)
    providers: Dict[str, Dict[str, int]] = {}
    issues: List[Dict[str, str]] = []

    for path_text in har_paths:
        path = Path(str(path_text or "").strip())
        if not path.exists():
            issues.append(
                {
                    "provider": "PMS",
                    "code": "PMS_HAR_NOT_FOUND",
                    "message": f"HAR file not found: {path}",
                }
            )
            continue
        try:
            records = parse_source_reservations_from_har(path)
        except Exception as exc:  # noqa: BLE001
            issues.append(
                {
                    "provider": "PMS",
                    "code": "PMS_HAR_PARSE_FAILED",
                    "message": f"{path}: {exc}",
                }
            )
            continue

        for record in records:
            checkin = getattr(record, "checkin", None)
            checkout = getattr(record, "checkout", None)
            if not isinstance(checkin, dt.date) or not isinstance(checkout, dt.date):
                continue
            # checkout is exclusive in current reservation model.
            if checkout <= start_day or checkin > end_day:
                continue
            provider = normalize_text(getattr(record, "channel", "")).upper()
            if not provider:
                provider = "UNKNOWN"
            status_bucket = normalize_text(getattr(record, "status_bucket", "")).upper()
            row = providers.setdefault(
                provider,
                {
                    "reservation_count": 0,
                    "active_count": 0,
                    "canceled_count": 0,
                },
            )
            row["reservation_count"] += 1
            if status_bucket == "CANCELED":
                row["canceled_count"] += 1
            else:
                row["active_count"] += 1

    normalized_providers = {
        key: {
            "reservation_count": int(value.get("reservation_count", 0)),
            "active_count": int(value.get("active_count", 0)),
            "canceled_count": int(value.get("canceled_count", 0)),
        }
        for key, value in sorted(providers.items())
    }
    return {
        "enabled": True,
        "har_paths": har_paths,
        "providers": normalized_providers,
        "issues": issues,
    }


def build_audit_engine_summary(
    ota_sources: Dict[str, Any],
    pms_sources: Dict[str, Any],
) -> Dict[str, Any]:
    return build_ota_pms_anomaly_report(
        ota_sources=ota_sources,
        pms_sources=pms_sources,
    )


def ensure_bearer(token: str) -> str:
    text = str(token or "").strip()
    if not text:
        return ""
    if text.lower().startswith("bearer "):
        return text
    return f"Bearer {text}"


def parse_json_text(text: Any) -> Optional[Any]:
    if not isinstance(text, str):
        return None
    stripped = text.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except Exception:  # noqa: BLE001
        return None


def create_http_session(*, pool_size: int = 8) -> requests.Session:
    session = requests.Session()
    adapter = HTTPAdapter(pool_connections=pool_size, pool_maxsize=pool_size, max_retries=2)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def load_har_entries(har_path: Optional[str]) -> List[Dict[str, Any]]:
    path_text = str(har_path or "").strip()
    if not path_text:
        return []
    path = Path(path_text)
    if not path.exists():
        raise AuditError(f"HAR file not found: {path}")
    try:
        return load_cached_har_entries(path)
    except Exception as exc:  # noqa: BLE001
        raise AuditError(f"Failed to read HAR: {path}") from exc


def get_entry_time(entry: Dict[str, Any]) -> str:
    value = entry.get("startedDateTime")
    if not isinstance(value, str):
        return ""
    return value


def select_latest_har_entry(
    entries: Iterable[Dict[str, Any]],
    host: Optional[str],
    path_includes: str,
) -> Optional[Dict[str, Any]]:
    target_host = str(host or "").strip().lower()
    include_path = str(path_includes or "").strip()
    latest = None
    latest_key = ""

    for entry in entries:
        req = entry.get("request", {})
        url = req.get("url", "")
        if not isinstance(url, str) or not url:
            continue
        match = re.match(r"https?://([^/]+)(/[^?#]*)?", url)
        if not match:
            continue
        entry_host = (match.group(1) or "").lower()
        entry_path = match.group(2) or ""
        if target_host and entry_host != target_host:
            continue
        if include_path and include_path not in entry_path:
            continue
        key = get_entry_time(entry)
        if latest is None or key >= latest_key:
            latest = entry
            latest_key = key

    return latest


def extract_headers_from_har(
    har_path: Optional[str],
    host: Optional[str],
    path_includes: str,
    include_names: Optional[set[str]] = None,
) -> Dict[str, str]:
    entries = load_har_entries(har_path)
    if not entries:
        return {}
    entry = select_latest_har_entry(entries, host=host, path_includes=path_includes)
    if not entry:
        return {}

    names = set(n.lower() for n in (include_names or DEFAULT_HAR_HEADER_NAMES))
    headers: Dict[str, str] = {}
    req_headers = entry.get("request", {}).get("headers", [])
    if not isinstance(req_headers, list):
        return headers

    for row in req_headers:
        if not isinstance(row, dict):
            continue
        name = str(row.get("name", "")).strip()
        if not name or name.startswith(":"):
            continue
        lower = name.lower()
        if lower in DROP_HEADER_NAMES:
            continue
        if names and lower not in names:
            continue
        value = row.get("value")
        if value is None:
            continue
        headers[name] = str(value)
    return headers


def extract_station_token_from_har(har_path: Optional[str]) -> Optional[str]:
    entries = load_har_entries(har_path)
    if not entries:
        return None
    ordered = sorted(entries, key=get_entry_time, reverse=True)
    for entry in ordered:
        req = entry.get("request", {})
        url = str(req.get("url", ""))
        if "/admin/admin/login" not in url:
            continue
        text = (
            entry.get("response", {})
            .get("content", {})
            .get("text", "")
        )
        payload = parse_json_text(text)
        if not isinstance(payload, dict):
            continue
        token = payload.get("data", {}).get("accessToken")
        if isinstance(token, str) and token.strip():
            return token.strip()
    return None


def upsert_header(headers: Dict[str, str], name: str, value: Any) -> None:
    key = str(name or "").strip()
    text = str(value or "").strip()
    if not key or not text:
        return
    lower = key.lower()
    for existing in list(headers.keys()):
        if existing.lower() == lower:
            headers[existing] = text
            return
    headers[key] = text


def drop_header(headers: Dict[str, str], name: str) -> None:
    key = str(name or "").strip().lower()
    if not key:
        return
    for existing in list(headers.keys()):
        if existing.lower() == key:
            headers.pop(existing, None)


def merge_headers(base: Dict[str, str], extra: Optional[Dict[str, str]]) -> Dict[str, str]:
    out = dict(base or {})
    for name, value in (extra or {}).items():
        upsert_header(out, name, value)
    return out


def get_header_value_ci(headers: Optional[Dict[str, Any]], name: str) -> str:
    if not isinstance(headers, dict):
        return ""
    key = str(name or "").strip().lower()
    if not key:
        return ""
    for header_name, header_value in headers.items():
        if str(header_name or "").strip().lower() != key:
            continue
        text = str(header_value or "").strip()
        if text:
            return text
    return ""


def sanitize_naver_schedule_headers(
    headers: Dict[str, str],
    role_override: str = "",
) -> Dict[str, str]:
    out = merge_headers({}, headers or {})
    # Naver daily-schedules can reject role=OWNER. Only send role when explicitly overridden.
    drop_header(out, "x-booking-naver-role")
    explicit_role = str(role_override or "").strip()
    if explicit_role:
        upsert_header(out, "x-booking-naver-role", explicit_role)
    return out


def load_auth_bundle_payload(raw_text: Optional[str], file_path: Optional[str]) -> Optional[Dict[str, Any]]:
    text = str(raw_text or "").strip()
    path_text = str(file_path or "").strip()
    if path_text:
        path = Path(path_text)
        if not path.exists():
            raise AuditError(f"Auth bundle file not found: {path}")
        try:
            text = path.read_text(encoding="utf-8")
        except Exception as exc:  # noqa: BLE001
            raise AuditError(f"Failed to read auth bundle file: {path}") from exc
    if not text:
        return None
    parsed = parse_json_text(text)
    if not isinstance(parsed, dict):
        raise AuditError("Auth bundle must be a JSON object.")
    return parsed


def select_provider_auth_bundle(payload: Optional[Dict[str, Any]], provider_type: str) -> Optional[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return None

    provider = str(payload.get("providerType") or payload.get("provider") or "").strip().lower()
    if provider == provider_type:
        return payload
    direct_item = payload.get(provider_type)
    if isinstance(direct_item, dict):
        return direct_item

    for key in ("authBundles", "providerAuthBundles", "providers"):
        bucket = payload.get(key)
        if isinstance(bucket, dict):
            item = bucket.get(provider_type)
            if isinstance(item, dict):
                return item

    if provider_type == "naver-partner" and isinstance(payload.get("naver"), dict):
        return payload["naver"]
    if provider_type == "admin-station" and isinstance(payload.get("station"), dict):
        return payload["station"]

    if not provider and any(
        key in payload for key in ("cookies", "cookieHeader", "authorization", "accessToken", "csrfToken", "role")
    ):
        return payload
    return None


def build_cookie_header_from_records(cookies: Any) -> str:
    parts: List[str] = []
    seen = set()
    for item in cookies if isinstance(cookies, list) else []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        key = (
            str(item.get("storeId", "")).strip(),
            str(item.get("domain", "")).strip(),
            str(item.get("path", "")).strip() or "/",
            name,
        )
        if key in seen:
            continue
        seen.add(key)
        parts.append(f"{name}={item.get('value', '')}")
    return "; ".join(parts)


def extract_auth_headers_from_bundle(payload: Optional[Dict[str, Any]], provider_type: str) -> Dict[str, str]:
    bundle = select_provider_auth_bundle(payload, provider_type)
    if not isinstance(bundle, dict):
        return {}

    headers: Dict[str, str] = {}
    header_map = bundle.get("headers") if isinstance(bundle.get("headers"), dict) else {}
    if provider_type == "admin-station":
        token = ensure_bearer(
            str(
                bundle.get("authorization")
                or bundle.get("accessToken")
                or bundle.get("token")
                or bundle.get("bearer")
                or get_header_value_ci(header_map, "authorization")
                or ""
            ).strip()
        )
        if token:
            upsert_header(headers, "Authorization", token)
        cookie_header = str(bundle.get("cookieHeader") or bundle.get("cookie") or "").strip()
        if not cookie_header:
            cookie_header = get_header_value_ci(header_map, "cookie")
        if not cookie_header:
            cookie_header = build_cookie_header_from_records(bundle.get("cookies"))
        csrf_token = str(
            bundle.get("csrfToken")
            or bundle.get("x-csrf-token")
            or bundle.get("csrf")
            or get_header_value_ci(header_map, "x-csrf-token")
            or ""
        ).strip()
        if cookie_header:
            upsert_header(headers, "Cookie", cookie_header)
        if csrf_token:
            upsert_header(headers, "x-csrf-token", csrf_token)
        return headers

    cookie_header = str(bundle.get("cookieHeader") or bundle.get("cookie") or "").strip()
    if not cookie_header:
        cookie_header = get_header_value_ci(header_map, "cookie")
    if not cookie_header:
        cookie_header = build_cookie_header_from_records(bundle.get("cookies"))
    csrf_token = str(
        bundle.get("csrfToken")
        or bundle.get("x-csrf-token")
        or bundle.get("csrf")
        or get_header_value_ci(header_map, "x-csrf-token")
        or ""
    ).strip()
    role = str(
        bundle.get("role")
        or bundle.get("x-booking-naver-role")
        or bundle.get("naverRole")
        or get_header_value_ci(header_map, "x-booking-naver-role")
        or ""
    ).strip()
    if cookie_header:
        upsert_header(headers, "Cookie", cookie_header)
    if csrf_token:
        upsert_header(headers, "x-csrf-token", csrf_token)
    if role:
        upsert_header(headers, "x-booking-naver-role", role)
    return headers


def request_json(
    session: requests.Session,
    method: str,
    url: str,
    headers: Dict[str, str],
    timeout_sec: int,
    params: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Any:
    kwargs: Dict[str, Any] = {
        "method": method.upper(),
        "url": url,
        "headers": headers,
        "timeout": timeout_sec,
    }
    if params is not None:
        kwargs["params"] = params
    if payload is not None:
        kwargs["json"] = payload

    response = session.request(**kwargs)
    if not response.ok:
        body = response.text
        raise AuditError(
            f"HTTP {response.status_code} {method.upper()} {url} failed: {body[:500]}"
        )

    if not response.content:
        return {}
    try:
        parsed = response.json()
    except ValueError:
        text = response.text.strip()
        if not text:
            return {}
        parsed = parse_json_text(text)
    if parsed is not None:
        return parsed
    text = response.text.strip()
    return {"raw": text}


def load_sheet_snapshot(args: argparse.Namespace) -> Dict[str, Any]:
    spreadsheet_id = extract_sheet_id(args.spreadsheet)
    if not spreadsheet_id:
        raise AuditError(f"Invalid spreadsheet ID/URL: {args.spreadsheet}")
    access_token = get_access_token(args)
    client = GoogleSheetsReadonlyClient(access_token=access_token, session=create_http_session())

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
    if not date_cols:
        raise AuditError("No date columns found in sheet.")

    start_limit = parse_optional_iso_date(args.sync_start_date)
    end_limit = parse_optional_iso_date(args.sync_end_date)
    if start_limit and end_limit and start_limit > end_limit:
        raise AuditError("--sync-start-date must be <= --sync-end-date")

    filtered_date_cols = []
    for dc in date_cols:
        if start_limit and dc.date < start_limit:
            continue
        if end_limit and dc.date > end_limit:
            continue
        filtered_date_cols.append(dc)
    if not filtered_date_cols:
        raise AuditError("No date columns remain after sync date filter.")

    inventory_rows = find_inventory_rows(matrix, row_start=date_row + 2)
    naver_values = (
        extract_inventory_values_by_date(matrix, inventory_rows["NAVER"], filtered_date_cols)
        if "NAVER" in inventory_rows
        else {}
    )
    station_values = (
        extract_inventory_values_by_date(matrix, inventory_rows["STATION"], filtered_date_cols)
        if "STATION" in inventory_rows
        else {}
    )

    return {
        "spreadsheet_id": spreadsheet_id,
        "sheet_name": sheet_name,
        "date_cols": filtered_date_cols,
        "inventory_rows": inventory_rows,
        "naver_values": naver_values,
        "station_values": station_values,
    }


def ensure_provider_inventory_rows(snapshot: Dict[str, Any], provider: str) -> None:
    if provider in ("station", "both") and "STATION" not in snapshot["inventory_rows"]:
        raise AuditError("Sheet inventory row is missing for provider: STATION")
    if provider in ("naver", "both") and "NAVER" not in snapshot["inventory_rows"]:
        raise AuditError("Sheet inventory row is missing for provider: NAVER")


def build_sync_targets(snapshot: Dict[str, Any], provider: str, mode: str) -> Dict[str, Any]:
    station_targets = build_target_map(snapshot["station_values"], mode, provider_key="STATION")
    naver_targets = build_target_map(snapshot["naver_values"], mode, provider_key="NAVER")

    if provider in ("station", "both") and not station_targets:
        raise AuditError("No target values parsed for STATION in selected date range.")
    if provider in ("naver", "both") and not naver_targets:
        raise AuditError("No target values parsed for NAVER in selected date range.")

    station_validation = analyze_target_map(
        snapshot["station_values"],
        station_targets,
        provider_key="STATION",
    )
    naver_validation = analyze_target_map(
        snapshot["naver_values"],
        naver_targets,
        provider_key="NAVER",
    )

    date_candidates = sorted(set(station_targets.keys()) | set(naver_targets.keys()))
    if not date_candidates:
        raise AuditError("No inventory target values parsed from sheet.")

    return {
        "station_targets": station_targets,
        "naver_targets": naver_targets,
        "station_validation": station_validation,
        "naver_validation": naver_validation,
        "range_start": date_candidates[0],
        "range_end": date_candidates[-1],
    }


def initialize_sync_summary(
    args: argparse.Namespace,
    snapshot: Dict[str, Any],
    provider: str,
    mode: str,
    target_plan: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "requestedApply": bool(args.apply),
        "applied": False,
        "engine": {
            "architecture": "state_reconciliation",
            "mode": "full_recalc_diff",
            "version": "v1",
        },
        "provider": provider,
        "sheet_stock_mode": mode,
        "sheet": {
            "spreadsheet_id": snapshot["spreadsheet_id"],
            "sheet_name": snapshot["sheet_name"],
            "inventory_rows": snapshot["inventory_rows"],
            "target_dates": {
                "start": target_plan["range_start"],
                "end": target_plan["range_end"],
            },
            "target_counts": {
                "station": len(target_plan["station_targets"]),
                "naver": len(target_plan["naver_targets"]),
            },
        },
        "validation": {
            "station": target_plan["station_validation"],
            "naver": target_plan["naver_validation"],
        },
        "inventory_planner": {},
        "ota_sources": {
            "enabled": False,
            "providers": {},
            "issues": [],
        },
        "pms_sources": {
            "enabled": False,
            "providers": {},
            "issues": [],
        },
        "audit_engine": {
            "enabled": False,
            "rows": [],
            "anomalies": [],
            "counts": {
                "providers": 0,
                "mismatches": 0,
                "anomalies": 0,
                "warn": 0,
                "error": 0,
            },
        },
        "ui": {
            "forcedCloseOverrides": [],
            "forcedCloseProcessed": [],
        },
        "reconciliation": {
            "providers": {},
            "counts": {
                "providers": 0,
                "drift_dates": 0,
                "action_dates": 0,
            },
            "fingerprint": "",
        },
        "policy": {"blocked": False, "issues": []},
        "station": {},
        "naver": {},
    }


def _sorted_int_date_map(values: Dict[str, int]) -> Dict[str, int]:
    return {day: int(values[day]) for day in sorted(values.keys())}


def _summarize_station_actual_units_by_date_py(
    station_rows: List[Dict[str, Any]],
    room_ids: List[str],
) -> Dict[str, int]:
    room_id_set = {str(rid).strip() for rid in room_ids if str(rid).strip()}
    by_date: Dict[str, int] = defaultdict(int)
    for row in station_rows:
        day = normalize_text(row.get("date", ""))
        room_id = normalize_text(row.get("roomId", ""))
        if not day or not room_id:
            continue
        if room_id_set and room_id not in room_id_set:
            continue
        stock = row.get("stockCount")
        stock_i = int(stock) if isinstance(stock, int) else 0
        by_date[day] += max(stock_i, 0)
    return _sorted_int_date_map(by_date)


def summarize_station_actual_units_by_date(
    station_rows: List[Dict[str, Any]],
    room_ids: List[str],
) -> Dict[str, int]:
    return bridge_summarize_station_actual_units_by_date(
        station_rows,
        room_ids,
        fallback=_summarize_station_actual_units_by_date_py,
    )


def _summarize_naver_actual_units_by_date_py(
    current_by_room: Dict[str, Dict[str, Dict[str, Any]]],
    room_ids: List[str],
) -> Dict[str, int]:
    room_id_set = {str(rid).strip() for rid in room_ids if str(rid).strip()}
    by_date: Dict[str, int] = defaultdict(int)
    for room_id, room_map in (current_by_room or {}).items():
        rid = normalize_text(room_id)
        if room_id_set and rid not in room_id_set:
            continue
        if not isinstance(room_map, dict):
            continue
        for day, payload in room_map.items():
            day_key = normalize_text(day)
            if not day_key or not isinstance(payload, dict):
                continue
            stock = payload.get("stock")
            stock_i = int(stock) if isinstance(stock, int) else 0
            by_date[day_key] += max(stock_i, 0)
    return _sorted_int_date_map(by_date)


def summarize_naver_actual_units_by_date(
    current_by_room: Dict[str, Dict[str, Dict[str, Any]]],
    room_ids: List[str],
) -> Dict[str, int]:
    return bridge_summarize_naver_actual_units_by_date(
        current_by_room,
        room_ids,
        fallback=_summarize_naver_actual_units_by_date_py,
    )


def summarize_station_action_stats_by_date(actions: List[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
    by_date: Dict[str, Dict[str, int]] = {}
    for action in actions or []:
        day = normalize_text(action.get("date", ""))
        if not day:
            continue
        row = by_date.setdefault(
            day,
            {
                "action_count": 0,
                "change_actions": 0,
                "stock_actions": 0,
                "sale_day_actions": 0,
                "mismatch_signals": 0,
            },
        )
        has_change = bool(action.get("hasChange"))
        if has_change:
            row["action_count"] += 1
            row["stock_actions"] += 1
            row["change_actions"] += 1
        row["mismatch_signals"] += max(int(action.get("mismatchCount") or 0), 0)
    return {day: by_date[day] for day in sorted(by_date.keys())}


def summarize_naver_action_stats_by_date(actions: List[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
    by_date: Dict[str, Dict[str, int]] = {}
    for action in actions or []:
        day = normalize_text(action.get("date", ""))
        if not day:
            continue
        row = by_date.setdefault(
            day,
            {
                "action_count": 0,
                "change_actions": 0,
                "stock_actions": 0,
                "sale_day_actions": 0,
                "mismatch_signals": 0,
            },
        )
        row["action_count"] += 1
        row["change_actions"] += 1
        action_type = normalize_text(action.get("type", "")).lower()
        if action_type == "stock":
            row["stock_actions"] += 1
        elif action_type == "sale-day":
            row["sale_day_actions"] += 1
        if bool(action.get("countAsMismatch", True)):
            row["mismatch_signals"] += 1
    return {day: by_date[day] for day in sorted(by_date.keys())}


def _build_provider_reconciliation_py(
    provider_key: str,
    desired_units_by_date: Dict[str, int],
    actual_units_by_date: Dict[str, int],
    action_stats_by_date: Dict[str, Dict[str, int]],
) -> Dict[str, Any]:
    desired = _sorted_int_date_map(desired_units_by_date or {})
    actual = _sorted_int_date_map(actual_units_by_date or {})
    dates = sorted(set(desired.keys()) | set(actual.keys()) | set((action_stats_by_date or {}).keys()))
    rows: List[Dict[str, Any]] = []
    drift_dates = 0
    action_dates = 0
    total_actions = 0
    for day in dates:
        desired_units = int(desired.get(day, 0))
        actual_units = int(actual.get(day, 0))
        drift_units = desired_units - actual_units
        action_stats = action_stats_by_date.get(day, {}) if isinstance(action_stats_by_date, dict) else {}
        action_count = int(action_stats.get("action_count", 0))
        stock_actions = int(action_stats.get("stock_actions", 0))
        sale_day_actions = int(action_stats.get("sale_day_actions", 0))
        mismatch_signals = int(action_stats.get("mismatch_signals", 0))
        if drift_units != 0:
            drift_dates += 1
        if action_count > 0:
            action_dates += 1
        total_actions += action_count
        rows.append(
            {
                "date": day,
                "desired_units": desired_units,
                "actual_units": actual_units,
                "drift_units": drift_units,
                "action_count": action_count,
                "stock_actions": stock_actions,
                "sale_day_actions": sale_day_actions,
                "mismatch_signals": mismatch_signals,
            }
        )

    return {
        "provider": normalize_text(provider_key).upper(),
        "mode": "full_recalc_diff",
        "desired_units_by_date": desired,
        "actual_units_by_date": actual,
        "rows": rows,
        "counts": {
            "dates": len(rows),
            "drift_dates": drift_dates,
            "action_dates": action_dates,
            "actions": total_actions,
        },
    }


def build_provider_reconciliation(
    provider_key: str,
    desired_units_by_date: Dict[str, int],
    actual_units_by_date: Dict[str, int],
    action_stats_by_date: Dict[str, Dict[str, int]],
) -> Dict[str, Any]:
    return bridge_build_provider_reconciliation(
        provider_key,
        desired_units_by_date,
        actual_units_by_date,
        action_stats_by_date,
        fallback=_build_provider_reconciliation_py,
    )


def compute_reconciliation_fingerprint(summary: Dict[str, Any]) -> str:
    reconciliation = summary.get("reconciliation", {})
    providers = reconciliation.get("providers", {})
    payload = json.dumps(providers, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def refresh_reconciliation_counts(summary: Dict[str, Any]) -> None:
    reconciliation = summary.setdefault("reconciliation", {})
    providers = reconciliation.get("providers", {})
    drift_dates = 0
    action_dates = 0
    provider_count = 0
    for key in ("station", "naver"):
        provider = providers.get(key)
        if not isinstance(provider, dict):
            continue
        provider_count += 1
        counts = provider.get("counts", {})
        drift_dates += int(counts.get("drift_dates", 0))
        action_dates += int(counts.get("action_dates", 0))
    reconciliation["counts"] = {
        "providers": provider_count,
        "drift_dates": drift_dates,
        "action_dates": action_dates,
    }
    reconciliation["fingerprint"] = compute_reconciliation_fingerprint(summary)


def _prepare_provider_syncs(
    args: argparse.Namespace,
    auth_bundle_payload: Dict[str, Any],
    provider: str,
    station_room_ids: List[str],
    naver_room_ids: List[str],
    range_start: str,
    range_end: str,
    station_targets: Dict[str, int],
    naver_targets: Dict[str, int],
) -> Dict[str, Tuple[Dict[str, Any], Optional[Tuple[Dict[str, str], List[Dict[str, Any]]]], Optional[Exception]]]:
    tasks: Dict[str, Any] = {}
    with ThreadPoolExecutor(max_workers=2) as executor:
        if provider in ("station", "both"):
            tasks["station"] = executor.submit(
                _run_provider_prepare,
                "station",
                args,
                auth_bundle_payload,
                station_room_ids,
                range_start,
                range_end,
                station_targets,
            )
        if provider in ("naver", "both"):
            tasks["naver"] = executor.submit(
                _run_provider_prepare,
                "naver",
                args,
                auth_bundle_payload,
                naver_room_ids,
                range_start,
                range_end,
                naver_targets,
            )
        return {name: future.result() for name, future in tasks.items()}


def _run_provider_prepare(
    provider_key: str,
    args: argparse.Namespace,
    auth_bundle_payload: Dict[str, Any],
    room_ids: List[str],
    range_start: str,
    range_end: str,
    targets: Dict[str, int],
) -> Tuple[Dict[str, Any], Optional[Tuple[Dict[str, str], List[Dict[str, Any]]]], Optional[Exception]]:
    session = create_http_session()
    try:
        if provider_key == "station":
            summary, apply_context = prepare_station_sync(
                session=session,
                args=args,
                auth_bundle_payload=auth_bundle_payload,
                room_ids=room_ids,
                range_start=range_start,
                range_end=range_end,
                station_targets=targets,
            )
        else:
            summary, apply_context = prepare_naver_sync(
                session=session,
                args=args,
                auth_bundle_payload=auth_bundle_payload,
                room_ids=room_ids,
                range_start=range_start,
                range_end=range_end,
                naver_targets=targets,
            )
        return summary, apply_context, None
    except Exception as exc:  # noqa: BLE001
        return {}, None, exc
    finally:
        session.close()


def prepare_station_sync(
    session: requests.Session,
    args: argparse.Namespace,
    auth_bundle_payload: Dict[str, Any],
    room_ids: List[str],
    range_start: str,
    range_end: str,
    station_targets: Dict[str, int],
) -> Tuple[Dict[str, Any], Tuple[Dict[str, str], List[Dict[str, Any]]]]:
    station_headers = extract_headers_from_har(
        args.station_har,
        host="api.admin-stationbyuhc.com",
        path_includes=f"/admin/branch/{args.station_branch_id}/",
    )
    station_headers = merge_headers(
        station_headers,
        extract_auth_headers_from_bundle(auth_bundle_payload, "admin-station"),
    )
    station_token = args.station_token.strip()
    if not station_token:
        station_token = extract_station_token_from_har(args.station_har) or ""
    if station_token:
        upsert_header(station_headers, "Authorization", ensure_bearer(station_token))

    station_rows = fetch_station_calendar(
        session,
        args,
        headers=station_headers,
        start_date=range_start,
        end_date=range_end,
    )
    station_actions, station_warnings = plan_station_actions(
        station_targets,
        station_rows,
        room_ids=room_ids,
        branch_id=args.station_branch_id,
    )
    station_actual_units = summarize_station_actual_units_by_date(station_rows, room_ids)
    station_action_stats = summarize_station_action_stats_by_date(station_actions)
    reconciliation = build_provider_reconciliation(
        "STATION",
        station_targets,
        station_actual_units,
        station_action_stats,
    )
    summary_section = {
        "room_ids": room_ids,
        "target_dates": len(station_targets),
        "actions": station_actions,
        "effective_actions": [action for action in station_actions if bool(action.get("hasChange"))],
        "warnings": station_warnings,
        "results": [],
        "reconciliation": reconciliation,
    }
    return summary_section, (station_headers, station_actions)


def prepare_naver_sync(
    session: requests.Session,
    args: argparse.Namespace,
    auth_bundle_payload: Dict[str, Any],
    room_ids: List[str],
    range_start: str,
    range_end: str,
    naver_targets: Dict[str, int],
) -> Tuple[Dict[str, Any], Tuple[Dict[str, str], List[Dict[str, Any]]]]:
    naver_headers = extract_headers_from_har(
        args.naver_har,
        host="api-partner.booking.naver.com",
        path_includes=f"/businesses/{args.naver_business_id}/biz-items",
    )
    naver_headers = merge_headers(
        naver_headers,
        extract_auth_headers_from_bundle(auth_bundle_payload, "naver-partner"),
    )
    naver_headers = sanitize_naver_schedule_headers(
        naver_headers,
        role_override=args.naver_role,
    )
    if args.naver_cookie.strip():
        upsert_header(naver_headers, "Cookie", args.naver_cookie.strip())
    if args.naver_csrf_token.strip():
        upsert_header(naver_headers, "x-csrf-token", args.naver_csrf_token.strip())

    current_by_room: Dict[str, Dict[str, Dict[str, Any]]] = {}
    naver_read_sleep_sec = max(0, int(args.naver_read_sleep_ms)) / 1000.0
    total_rooms = len(room_ids)
    for idx, rid in enumerate(room_ids):
        current_by_room[rid] = fetch_naver_daily_schedule_map(
            session,
            args,
            headers=naver_headers,
            biz_item_id=rid,
            start_date=range_start,
            end_date=range_end,
        )
        if naver_read_sleep_sec > 0 and idx + 1 < total_rooms:
            time.sleep(naver_read_sleep_sec)

    naver_actions = plan_naver_actions(
        naver_targets,
        room_ids=room_ids,
        current_by_room=current_by_room,
        desc=args.naver_desc,
    )
    naver_actual_units = summarize_naver_actual_units_by_date(current_by_room, room_ids)
    naver_action_stats = summarize_naver_action_stats_by_date(naver_actions)
    reconciliation = build_provider_reconciliation(
        "NAVER",
        naver_targets,
        naver_actual_units,
        naver_action_stats,
    )
    summary_section = {
        "room_ids": room_ids,
        "target_dates": len(naver_targets),
        "actions": naver_actions,
        "effective_actions": list(naver_actions),
        "results": [],
        "reconciliation": reconciliation,
    }
    return summary_section, (naver_headers, naver_actions)


def build_provider_fetch_error_summary(
    provider_key: str,
    room_ids: List[str],
    targets: Dict[str, int],
    exc: Exception,
) -> Dict[str, Any]:
    provider_label = normalize_text(provider_key).upper() or "UNKNOWN"
    message = str(exc).strip() or exc.__class__.__name__
    desired_units = _sorted_int_date_map(targets or {})
    rows: List[Dict[str, Any]] = [
        {
            "date": day,
            "desired_units": int(units),
            "actual_units": None,
            "drift": None,
            "status": "unavailable",
            "actions": {"total": 0, "stock": 0, "sale_day": 0},
        }
        for day, units in desired_units.items()
    ]
    reconciliation = {
        "provider": provider_label,
        "mode": "full_recalc_diff",
        "desired_units_by_date": desired_units,
        "actual_units_by_date": {},
        "rows": rows,
        "counts": {
            "dates": len(rows),
            "drift_dates": 0,
            "action_dates": 0,
            "actions": 0,
        },
        "available": False,
        "error": {
            "type": exc.__class__.__name__,
            "message": message,
        },
    }
    return {
        "room_ids": list(room_ids),
        "target_dates": len(desired_units),
        "actions": [],
        "warnings": [
            {
                "provider": provider_label,
                "code": f"{provider_label}_FETCH_FAILED",
                "date": "-",
                "message": message,
            }
        ],
        "results": [],
        "reconciliation": reconciliation,
        "error": {
            "type": exc.__class__.__name__,
            "message": message,
        },
    }


def apply_sync_actions(
    session: requests.Session,
    args: argparse.Namespace,
    summary: Dict[str, Any],
    station_apply_context: Optional[Tuple[Dict[str, str], List[Dict[str, Any]]]],
    naver_apply_context: Optional[Tuple[Dict[str, str], List[Dict[str, Any]]]],
) -> None:
    if args.apply and station_apply_context:
        station_headers, station_actions = station_apply_context
        summary["station"]["results"] = apply_station_actions(
            session, args, station_headers, station_actions
        )

    if args.apply and naver_apply_context:
        naver_headers, naver_actions = naver_apply_context
        summary["naver"]["results"] = apply_naver_actions(
            session, args, naver_headers, naver_actions
        )

    summary["applied"] = bool(args.apply)


def provider_default_max(provider_key: str) -> Optional[int]:
    key = str(provider_key or "").strip().upper()
    value = PROVIDER_TARGET_MAX.get(key)
    return int(value) if isinstance(value, int) else None


def resolve_inventory_maximum(inv: Any, provider_key: str) -> Optional[int]:
    maximum = getattr(inv, "maximum", None)
    if isinstance(maximum, int):
        return max(maximum, 0)
    fallback = provider_default_max(provider_key)
    return max(fallback, 0) if isinstance(fallback, int) else None


def inventory_value_to_target_units(inv: Any, mode: str, provider_key: str) -> Optional[int]:
    raw = normalize_text(getattr(inv, "raw", ""))
    current = getattr(inv, "current", None)
    maximum = resolve_inventory_maximum(inv, provider_key)

    if raw:
        low = raw.lower().strip()
        if low in CLOSED_TEXTS:
            return 0

    if isinstance(current, int) and isinstance(maximum, int) and current >= maximum:
        return 0

    if mode == "available":
        if isinstance(current, int) and isinstance(maximum, int):
            return max(maximum - current, 0)
        if isinstance(current, int):
            return max(current, 0)
        if isinstance(maximum, int):
            return max(maximum, 0)
    else:
        if isinstance(current, int):
            return max(current, 0)
        if isinstance(maximum, int):
            return max(maximum, 0)

    if raw:
        nums = [int(x) for x in re.findall(r"\d+", raw)]
        if nums:
            return max(nums[0], 0)
    return None


def build_target_map(values_by_date: Dict[dt.date, Any], mode: str, provider_key: str) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for date_obj, inv in values_by_date.items():
        target = inventory_value_to_target_units(inv, mode, provider_key)
        if target is None:
            continue
        out[date_obj.isoformat()] = max(int(target), 0)
    return out


def analyze_target_map(
    values_by_date: Dict[dt.date, Any],
    targets: Dict[str, int],
    provider_key: str,
) -> Dict[str, Any]:
    issues: List[Dict[str, Any]] = []
    details: List[Dict[str, Any]] = []
    provider_max = provider_default_max(provider_key)

    for date_obj in sorted(values_by_date.keys()):
        inv = values_by_date[date_obj]
        date_key = date_obj.isoformat()
        raw = normalize_text(getattr(inv, "raw", ""))
        current = getattr(inv, "current", None)
        maximum = getattr(inv, "maximum", None)
        target = targets.get(date_key)
        parsed = target is not None

        details.append(
            {
                "date": date_key,
                "raw": raw,
                "current": current,
                "maximum": maximum,
                "parsed": parsed,
                "target": target,
            }
        )

        if not parsed:
            issues.append(
                {
                    "level": "error",
                    "code": "UNPARSEABLE_CELL",
                    "date": date_key,
                    "message": f"Cannot parse sheet cell value: '{raw}'",
                }
            )
            continue

        if target < 0:
            issues.append(
                {
                    "level": "error",
                    "code": "NEGATIVE_TARGET",
                    "date": date_key,
                    "message": f"Parsed target is negative: {target}",
                }
            )

        if isinstance(current, int) and isinstance(maximum, int) and current > maximum:
            issues.append(
                {
                    "level": "warn",
                    "code": "CURRENT_EXCEEDS_MAXIMUM",
                    "date": date_key,
                    "message": f"Current reservation exceeds maximum ({current}/{maximum}). Forced close applies.",
                }
            )

        if isinstance(maximum, int) and isinstance(provider_max, int) and maximum != provider_max:
            issues.append(
                {
                    "level": "warn",
                    "code": "MAX_DIFFERS_FROM_BASELINE",
                    "date": date_key,
                    "message": f"Sheet maximum {maximum} differs from baseline {provider_max}.",
                }
            )

        if isinstance(provider_max, int) and target > provider_max:
            issues.append(
                {
                    "level": "warn",
                    "code": "TARGET_EXCEEDS_PROVIDER_MAX",
                    "date": date_key,
                    "message": f"Target {target} exceeds provider baseline max {provider_max}.",
                }
            )

    return {
        "issues": issues,
        "details": details,
        "errorCount": sum(1 for row in issues if row.get("level") == "error"),
        "warnCount": sum(1 for row in issues if row.get("level") == "warn"),
    }


def _allocate_room_units_py(
    room_ids: List[str],
    current_stock_by_room: Dict[str, int],
    target_units: int,
) -> Dict[str, int]:
    ordered = [rid for rid in room_ids if rid]
    if not ordered:
        return {}
    limit = max(0, min(int(target_units), len(ordered)))

    selected: List[str] = []
    for rid in ordered:
        if current_stock_by_room.get(rid, 0) > 0 and len(selected) < limit:
            selected.append(rid)
    for rid in ordered:
        if len(selected) >= limit:
            break
        if rid not in selected:
            selected.append(rid)

    selected_set = set(selected)
    return {rid: (1 if rid in selected_set else 0) for rid in ordered}


def allocate_room_units(
    room_ids: List[str],
    current_stock_by_room: Dict[str, int],
    target_units: int,
) -> Dict[str, int]:
    return bridge_allocate_room_units(
        room_ids,
        current_stock_by_room,
        target_units,
        fallback=_allocate_room_units_py,
    )


def _allocate_room_units_flexible_py(
    room_ids: List[str],
    current_stock_by_room: Dict[str, int],
    target_units: int,
) -> Dict[str, int]:
    ordered = [rid for rid in room_ids if rid]
    if not ordered:
        return {}

    out: Dict[str, int] = {rid: 0 for rid in ordered}
    remaining = max(int(target_units), 0)

    for rid in ordered:
        if remaining <= 0:
            break
        current = max(int(current_stock_by_room.get(rid, 0)), 0)
        if current <= 0:
            continue
        keep = min(current, remaining)
        out[rid] = keep
        remaining -= keep

    idx = 0
    while remaining > 0 and ordered:
        rid = ordered[idx % len(ordered)]
        out[rid] = int(out.get(rid, 0)) + 1
        remaining -= 1
        idx += 1

    return out


def allocate_room_units_flexible(
    room_ids: List[str],
    current_stock_by_room: Dict[str, int],
    target_units: int,
) -> Dict[str, int]:
    return bridge_allocate_room_units_flexible(
        room_ids,
        current_stock_by_room,
        target_units,
        fallback=_allocate_room_units_flexible_py,
    )


def fetch_station_calendar(
    session: requests.Session,
    args: argparse.Namespace,
    headers: Dict[str, str],
    start_date: str,
    end_date: str,
) -> List[Dict[str, Any]]:
    url = f"{args.station_api_base.rstrip('/')}/admin/branch/{args.station_branch_id}/calendar"
    payload = request_json(
        session,
        "GET",
        url,
        headers=headers,
        timeout_sec=args.request_timeout_sec,
        params={"startDate": start_date, "endDate": end_date},
    )
    data = payload.get("data", payload)
    rows: List[Dict[str, Any]] = []
    if isinstance(data, dict):
        for room_name, value in data.items():
            if not isinstance(value, list):
                continue
            for row in value:
                if isinstance(row, dict):
                    normalized = dict(row)
                    if "roomName" not in normalized:
                        normalized["roomName"] = room_name
                    rows.append(normalized)
    elif isinstance(data, list):
        for row in data:
            if isinstance(row, dict):
                rows.append(dict(row))
    return rows


def plan_station_actions(
    targets: Dict[str, int],
    station_rows: List[Dict[str, Any]],
    room_ids: List[str],
    branch_id: str,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    rows_by_date: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in station_rows:
        date_val = str(row.get("date", "")).strip()
        room_id = str(row.get("roomId", "")).strip()
        if not date_val or not room_id:
            continue
        rows_by_date[date_val].append(row)

    actions: List[Dict[str, Any]] = []
    warnings: List[str] = []

    for day in sorted(targets.keys()):
        desired = targets[day]
        day_rows = rows_by_date.get(day, [])
        if not day_rows:
            warnings.append(
                {
                    "provider": "STATION",
                    "code": "STATION_NO_CALENDAR_ROWS",
                    "date": day,
                    "message": f"[station] no calendar rows for {day}",
                }
            )
            continue
        row_by_room_id: Dict[str, Dict[str, Any]] = {
            str(r.get("roomId")): r for r in day_rows if r.get("roomId") is not None
        }

        present_ids = [rid for rid in room_ids if rid in row_by_room_id]
        if not present_ids:
            present_ids = sorted(row_by_room_id.keys())

        current_stock_by_room: Dict[str, int] = {}
        price_set_ids: List[int] = []
        for rid in present_ids:
            row = row_by_room_id.get(rid)
            if not row:
                continue
            current_stock_by_room[rid] = int(row.get("stockCount") or 0)
            psid = row.get("priceSetId")
            if isinstance(psid, int):
                price_set_ids.append(psid)

        if not price_set_ids:
            warnings.append(
                {
                    "provider": "STATION",
                    "code": "STATION_NO_PRICE_SET_ID",
                    "date": day,
                    "message": f"[station] no priceSetId for {day}",
                }
            )
            continue
        price_set_id = price_set_ids[0]

        allocation = allocate_room_units(present_ids, current_stock_by_room, desired)
        adjusted_allocation: Dict[str, int] = {}
        room_changes: List[Dict[str, Any]] = []
        has_change = False
        mismatch_count = 0
        for rid in present_ids:
            row = row_by_room_id.get(rid, {})
            current_stock = int(current_stock_by_room.get(rid, 0))
            requested_target_stock = int(allocation.get(rid, 0))
            open_status = normalize_text(str(row.get("openStatus", ""))).lower()
            if open_status == "open":
                current_open = True
            elif open_status == "closed":
                current_open = False
            else:
                has_sale_ended = row.get("hasSaleEnded")
                if isinstance(has_sale_ended, bool):
                    current_open = not has_sale_ended
                else:
                    current_open = current_stock > 0

            target_open = requested_target_stock > 0
            should_adjust_stock = current_open or target_open
            target_stock = requested_target_stock if should_adjust_stock else current_stock
            stock_changed = current_stock != target_stock
            count_as_mismatch = stock_changed and (current_open or target_open)
            if stock_changed:
                has_change = True
            if count_as_mismatch:
                mismatch_count += 1
            adjusted_allocation[rid] = int(target_stock)
            room_changes.append(
                {
                    "roomId": rid,
                    "from": int(current_stock),
                    "to": int(target_stock),
                    "currentOpen": bool(current_open),
                    "targetOpen": bool(target_open),
                    "countAsMismatch": bool(count_as_mismatch),
                }
            )

        payload = {
            "branchId": int(branch_id),
            "priceSetId": int(price_set_id),
            "applyDates": [day],
            "roomSettingStocks": [
                {"roomId": int(rid), "settingStock": int(adjusted_allocation[rid])}
                for rid in present_ids
            ],
        }

        actions.append(
            {
                "date": day,
                "targetUnits": desired,
                "currentUnits": int(sum(current_stock_by_room.get(rid, 0) for rid in present_ids)),
                "hasChange": has_change,
                "mismatchCount": mismatch_count,
                "roomChanges": room_changes,
                "payload": payload,
            }
        )

    return actions, warnings


def fetch_naver_daily_schedule_map(
    session: requests.Session,
    args: argparse.Namespace,
    headers: Dict[str, str],
    biz_item_id: str,
    start_date: str,
    end_date: str,
) -> Dict[str, Dict[str, Any]]:
    adapter = NaverPartnerAdapter(
        session=session,
        config=NaverPartnerAdapterConfig(
            base_url=args.naver_api_base,
            business_id=args.naver_business_id,
            headers=headers,
            timeout_sec=args.request_timeout_sec,
        ),
    )

    try:
        rows = adapter.get_inventory(
            start_date=start_date,
            end_date=end_date,
            provider_item_ids=[biz_item_id],
        )
    except OTAAdapterError as exc:
        raise AuditError(str(exc)) from exc

    out: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        is_sale_day = row.meta.get("is_sale_day") if isinstance(row.meta, dict) else None
        out[row.date] = {
            "stock": max(int(row.stock), 0),
            "isSaleDay": bool(is_sale_day) if isinstance(is_sale_day, bool) else (int(row.stock) > 0),
        }
    return out


def plan_naver_actions(
    targets: Dict[str, int],
    room_ids: List[str],
    current_by_room: Dict[str, Dict[str, Dict[str, Any]]],
    desc: str,
) -> List[Dict[str, Any]]:
    actions: List[Dict[str, Any]] = []
    for day in sorted(targets.keys()):
        desired = targets[day]
        current_stock_by_room: Dict[str, int] = {}
        current_sale_by_room: Dict[str, bool] = {}
        for rid in room_ids:
            row = current_by_room.get(rid, {}).get(day, {})
            stock = row.get("stock")
            is_sale = row.get("isSaleDay")
            current_stock_by_room[rid] = int(stock) if isinstance(stock, int) else 0
            current_sale_by_room[rid] = bool(is_sale) if isinstance(is_sale, bool) else (current_stock_by_room[rid] > 0)

        allocation = allocate_room_units_flexible(room_ids, current_stock_by_room, desired)
        for rid in room_ids:
            requested_target_stock = allocation.get(rid, 0)
            current_stock = current_stock_by_room.get(rid, 0)
            target_sale = requested_target_stock > 0
            current_sale = current_sale_by_room.get(rid, current_stock > 0)
            should_adjust_stock = current_sale or target_sale
            target_stock = int(requested_target_stock) if should_adjust_stock else int(current_stock)

            if should_adjust_stock and current_stock != target_stock:
                actions.append(
                    {
                        "provider": "NAVER",
                        "type": "stock",
                        "bizItemId": rid,
                        "date": day,
                        "currentStock": int(current_stock),
                        "targetStock": int(target_stock),
                        "countAsMismatch": bool(current_sale and target_sale),
                        "payload": {
                            "startDate": day,
                            "endDate": day,
                            "stock": int(target_stock),
                            "desc": desc,
                        },
                    }
                )

            if current_sale != target_sale:
                actions.append(
                    {
                        "provider": "NAVER",
                        "type": "sale-day",
                        "bizItemId": rid,
                        "date": day,
                        "currentSaleDay": bool(current_sale),
                        "targetSaleDay": bool(target_sale),
                        "countAsMismatch": True,
                        "payload": {
                            "day": day,
                            "isSaleDay": bool(target_sale),
                        },
                    }
                )
    return actions


def normalize_planner_warning(warning: Any) -> Optional[Dict[str, Any]]:
    if isinstance(warning, dict):
        return {
            "provider": str(warning.get("provider") or "STATION").strip().upper() or "STATION",
            "code": str(warning.get("code") or "STATION_PLANNER_WARNING").strip().upper() or "STATION_PLANNER_WARNING",
            "date": str(warning.get("date") or "-").strip() or "-",
            "message": str(warning.get("message") or "").strip(),
        }
    text = str(warning or "").strip()
    if not text:
        return None
    m = re.search(r"\[station\]\s+no calendar rows for\s+(\d{4}-\d{2}-\d{2})", text, re.I)
    if m:
        return {
            "provider": "STATION",
            "code": "STATION_NO_CALENDAR_ROWS",
            "date": m.group(1),
            "message": text,
        }
    m = re.search(r"\[station\]\s+no priceSetId for\s+(\d{4}-\d{2}-\d{2})", text, re.I)
    if m:
        return {
            "provider": "STATION",
            "code": "STATION_NO_PRICE_SET_ID",
            "date": m.group(1),
            "message": text,
        }
    return {
        "provider": "STATION",
        "code": "STATION_PLANNER_WARNING",
        "date": "-",
        "message": text,
    }


def build_apply_guardrails(summary: Dict[str, Any]) -> Dict[str, Any]:
    blocking_issues: List[Dict[str, Any]] = []
    provider_mode = normalize_text(summary.get("provider", "")).lower()
    active_provider_keys: Tuple[str, ...]
    if provider_mode == "station":
        active_provider_keys = ("station",)
    elif provider_mode == "naver":
        active_provider_keys = ("naver",)
    else:
        active_provider_keys = ("station", "naver")

    def push_issue(date: str, issue_type: str, detail: str) -> None:
        blocking_issues.append(
            {
                "date": date or "-",
                "type": issue_type,
                "detail": detail,
            }
        )

    validation = summary.get("validation", {})
    for provider_key in active_provider_keys:
        provider_validation = validation.get(provider_key, {})
        for issue in provider_validation.get("issues", []):
            if not isinstance(issue, dict):
                continue
            level = str(issue.get("level") or "").strip().lower()
            code = str(issue.get("code") or "").strip().upper()
            detail = str(issue.get("message") or code or "validation issue").strip()
            date = str(issue.get("date") or "-").strip()
            if level == "error":
                push_issue(date, f"APPLY_BLOCK_{provider_key.upper()}_ERROR", detail)
                continue
            if level == "warn" and code in APPLY_BLOCKING_VALIDATION_WARN_CODES:
                push_issue(date, f"APPLY_BLOCK_{provider_key.upper()}_WARN", detail)

    if "station" in active_provider_keys:
        station_summary = summary.get("station", {})
        for raw_warning in station_summary.get("warnings", []):
            warning = normalize_planner_warning(raw_warning)
            if not warning:
                continue
            if warning["code"] not in APPLY_BLOCKING_STATION_WARNING_CODES:
                continue
            push_issue(
                warning.get("date") or "-",
                "APPLY_BLOCK_STATION_PLAN_WARN",
                warning.get("message") or warning["code"],
            )

    return {
        "blocked": bool(blocking_issues),
        "issues": blocking_issues,
    }


def apply_station_actions(
    session: requests.Session,
    args: argparse.Namespace,
    headers: Dict[str, str],
    actions: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    executor = StationExecutor(
        base_url=args.station_api_base,
        branch_id=args.station_branch_id,
        timeout_sec=args.request_timeout_sec,
        sleep_ms=args.request_sleep_ms,
    )
    return executor.apply_inventory_actions(
        session=session,
        headers=headers,
        actions=actions,
        request_json=request_json,
    )


def apply_naver_actions(
    session: requests.Session,
    args: argparse.Namespace,
    headers: Dict[str, str],
    actions: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    executor = NaverExecutor(
        base_url=args.naver_api_base,
        business_id=args.naver_business_id,
        timeout_sec=args.request_timeout_sec,
        sleep_ms=args.request_sleep_ms,
    )
    return executor.apply_inventory_actions(
        session=session,
        headers=headers,
        actions=actions,
        request_json=request_json,
    )


def command_sync_inventory(args: argparse.Namespace) -> int:
    snapshot = load_sheet_snapshot(args)
    provider = args.provider
    mode = args.sheet_stock_mode
    auth_bundle_payload = load_auth_bundle_payload(args.auth_bundle, args.auth_bundle_file)
    station_room_ids = parse_id_list(args.station_room_ids, DEFAULT_STATION_ROOM_IDS)
    naver_room_ids = parse_id_list(args.naver_room_ids, DEFAULT_NAVER_ROOM_IDS)

    ensure_provider_inventory_rows(snapshot, provider)
    target_plan = build_sync_targets(snapshot, provider, mode)
    station_targets = target_plan["station_targets"]
    naver_targets = target_plan["naver_targets"]
    station_validation = target_plan["station_validation"]
    naver_validation = target_plan["naver_validation"]
    range_start = target_plan["range_start"]
    range_end = target_plan["range_end"]
    wings_har_paths = parse_file_list(args.wings_har_file)
    pms_har_paths = parse_file_list(args.pms_har_file)
    if not pms_har_paths and wings_har_paths:
        pms_har_paths = list(wings_har_paths)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    summary_path = out_dir / "sync_inventory_summary.json"

    summary: Dict[str, Any] = initialize_sync_summary(args, snapshot, provider, mode, target_plan)
    summary["provider_errors"] = []

    station_apply_context: Optional[Tuple[Dict[str, str], List[Dict[str, Any]]]] = None
    naver_apply_context: Optional[Tuple[Dict[str, str], List[Dict[str, Any]]]] = None
    with create_http_session() as session:
        if wings_har_paths:
            summary["ota_sources"] = build_ota_har_source_summary(
                session=session,
                har_paths=wings_har_paths,
                range_start=range_start,
                range_end=range_end,
            )
        if pms_har_paths:
            summary["pms_sources"] = build_pms_har_source_summary(
                har_paths=pms_har_paths,
                range_start=range_start,
                range_end=range_end,
            )
        if summary.get("ota_sources", {}).get("enabled") and summary.get("pms_sources", {}).get("enabled"):
            summary["audit_engine"] = build_audit_engine_summary(
                summary.get("ota_sources", {}),
                summary.get("pms_sources", {}),
            )

        provider_results = _prepare_provider_syncs(
            args=args,
            auth_bundle_payload=auth_bundle_payload,
            provider=provider,
            station_room_ids=station_room_ids,
            naver_room_ids=naver_room_ids,
            range_start=range_start,
            range_end=range_end,
            station_targets=station_targets,
            naver_targets=naver_targets,
        )
        if "station" in provider_results:
            station_summary, station_apply_context, station_exc = provider_results["station"]
            if station_exc is not None:
                if provider != "both":
                    raise station_exc
                station_summary = build_provider_fetch_error_summary(
                    "station",
                    station_room_ids,
                    station_targets,
                    station_exc,
                )
                station_apply_context = None
                summary["provider_errors"].append(
                    {
                        "provider": "station",
                        "stage": "prepare",
                        "type": station_exc.__class__.__name__,
                        "message": str(station_exc).strip() or station_exc.__class__.__name__,
                    }
                )
            summary["station"] = station_summary
            summary["reconciliation"]["providers"]["station"] = station_summary.get("reconciliation", {})

        if "naver" in provider_results:
            naver_summary, naver_apply_context, naver_exc = provider_results["naver"]
            if naver_exc is not None:
                if provider != "both":
                    raise naver_exc
                naver_summary = build_provider_fetch_error_summary(
                    "naver",
                    naver_room_ids,
                    naver_targets,
                    naver_exc,
                )
                naver_apply_context = None
                summary["provider_errors"].append(
                    {
                        "provider": "naver",
                        "stage": "prepare",
                        "type": naver_exc.__class__.__name__,
                        "message": str(naver_exc).strip() or naver_exc.__class__.__name__,
                    }
                )
            summary["naver"] = naver_summary
            summary["reconciliation"]["providers"]["naver"] = naver_summary.get("reconciliation", {})

        refresh_reconciliation_counts(summary)

        summary["policy"] = build_apply_guardrails(summary)
        summary["inventory_planner"] = build_inventory_planner_summary(
            summary,
            requested_apply=bool(args.apply),
            approve_plan_token=args.approve_plan_token,
        )
        if args.apply and summary["policy"]["blocked"] and not args.allow_unsafe_apply:
            with summary_path.open("w", encoding="utf-8") as f:
                json.dump(summary, f, ensure_ascii=False, indent=2)
            raise AuditError(
                "Apply blocked by guardrails. "
                "Review sync_inventory_summary.json or re-run with --allow-unsafe-apply "
                "only after resolving the blocking warnings."
            )
        planner_approve = summary.get("inventory_planner", {}).get("stages", {}).get("approve", {})
        if args.apply and planner_approve.get("required") and not planner_approve.get("approved"):
            with summary_path.open("w", encoding="utf-8") as f:
                json.dump(summary, f, ensure_ascii=False, indent=2)
            required_token = str(planner_approve.get("required_token") or "").strip()
            raise AuditError(
                "Apply requires explicit approval token. "
                "Run dry-run first, then re-run with "
                f"--approve-plan-token {required_token}"
            )

        apply_sync_actions(
            session,
            args,
            summary,
            station_apply_context=station_apply_context,
            naver_apply_context=naver_apply_context,
        )

    with summary_path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print("Inventory sync complete")
    print(f"- apply requested: {bool(args.apply)}")
    print(f"- apply executed: {bool(summary.get('applied'))}")
    print(f"- provider: {provider}")
    print(f"- date range: {range_start} ~ {range_end}")
    print(f"- summary: {summary_path}")

    if provider in ("station", "both"):
        print(f"- station actions: {len(summary.get('station', {}).get('effective_actions', []))}")
    if provider in ("naver", "both"):
        print(f"- naver actions: {len(summary.get('naver', {}).get('effective_actions', []))}")
    if provider == "station":
        print(
            "- validation errors/warnings:"
            f" station={station_validation['errorCount']}/{station_validation['warnCount']}"
        )
    elif provider == "naver":
        print(
            "- validation errors/warnings:"
            f" naver={naver_validation['errorCount']}/{naver_validation['warnCount']}"
        )
    else:
        print(
            "- validation errors/warnings:"
            f" station={station_validation['errorCount']}/{station_validation['warnCount']},"
            f" naver={naver_validation['errorCount']}/{naver_validation['warnCount']}"
        )
    reconciliation_counts = summary.get("reconciliation", {}).get("counts", {})
    print(
        "- reconciliation:"
        f" providers={int(reconciliation_counts.get('providers', 0))},"
        f" drift_dates={int(reconciliation_counts.get('drift_dates', 0))},"
        f" action_dates={int(reconciliation_counts.get('action_dates', 0))}"
    )
    if summary["policy"]["blocked"]:
        print(f"- apply blocks: {len(summary['policy']['issues'])}")
    planner = summary.get("inventory_planner", {})
    planner_stages = planner.get("stages", {}) if isinstance(planner, dict) else {}
    planner_approve = planner_stages.get("approve", {}) if isinstance(planner_stages, dict) else {}
    if planner_stages:
        print(
            "- planner:"
            f" actions={int((planner.get('totals') or {}).get('planned_actions', 0))},"
            f" approval_required={bool(planner_approve.get('required'))},"
            f" approved={bool(planner_approve.get('approved'))}"
        )
        if planner_approve.get("required"):
            print(f"- planner approval token: {planner_approve.get('required_token', '')}")
    ota_sources = summary.get("ota_sources", {})
    if ota_sources.get("enabled"):
        provider_rows = ota_sources.get("providers", {})
        print(f"- ota source providers: {len(provider_rows)}")
        if ota_sources.get("issues"):
            print(f"- ota source issues: {len(ota_sources.get('issues', []))}")
    pms_sources = summary.get("pms_sources", {})
    if pms_sources.get("enabled"):
        provider_rows = pms_sources.get("providers", {})
        print(f"- pms source providers: {len(provider_rows)}")
        if pms_sources.get("issues"):
            print(f"- pms source issues: {len(pms_sources.get('issues', []))}")
    audit_engine = summary.get("audit_engine", {})
    if audit_engine.get("enabled"):
        counts = audit_engine.get("counts", {})
        print(
            "- audit engine:"
            f" mismatches={int(counts.get('mismatches', 0))},"
            f" anomalies={int(counts.get('anomalies', 0))},"
            f" warn={int(counts.get('warn', 0))},"
            f" error={int(counts.get('error', 0))}"
        )

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Read sheet NAVER/STATION inventory row values and sync to provider APIs."
    )

    parser.add_argument("--spreadsheet", default=DEFAULT_SHEET_ID)
    parser.add_argument("--sheet-name", default=DEFAULT_SHEET_NAME)
    parser.add_argument("--gid", type=int, default=DEFAULT_SHEET_GID)
    parser.add_argument("--start-row", type=int, default=DEFAULT_START_ROW)
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--sync-start-date", default="")
    parser.add_argument("--sync-end-date", default="")
    parser.add_argument("--sheet-stock-mode", choices=["available", "current"], default="available")
    parser.add_argument("--provider", choices=["station", "naver", "both"], default="both")
    parser.add_argument("--apply", action="store_true", help="Apply mutations. Default is dry-run.")
    parser.add_argument(
        "--allow-unsafe-apply",
        dest="allow_unsafe_apply",
        action="store_true",
        help="Override apply guardrails after reviewing the summary JSON. Use with caution.",
    )
    parser.add_argument(
        "--approve-plan-token",
        default="",
        help="Explicit approval token from dry-run inventory_planner before --apply.",
    )
    parser.add_argument("--out-dir", default="output")
    parser.add_argument(
        "--wings-har-file",
        default="",
        help="Comma/newline separated WINGS HAR file paths for OTA(HAR) source summary.",
    )
    parser.add_argument(
        "--pms-har-file",
        default="",
        help="Comma/newline separated HAR file paths for PMS(WINGS) audit summary.",
    )

    parser.add_argument("--access-token", default="")
    parser.add_argument("--token-file", default=DEFAULT_TOKEN_FILE)
    parser.add_argument("--client-id", default=DEFAULT_CLIENT_ID)
    parser.add_argument("--client-secret", default="")
    parser.add_argument("--auth-bundle", default="")
    parser.add_argument("--auth-bundle-file", default="")

    parser.add_argument("--station-api-base", default=DEFAULT_STATION_API_BASE)
    parser.add_argument("--station-branch-id", default=DEFAULT_STATION_BRANCH_ID)
    parser.add_argument("--station-room-ids", default=",".join(DEFAULT_STATION_ROOM_IDS))
    parser.add_argument("--station-token", default="")
    parser.add_argument("--station-har", default="")

    parser.add_argument("--naver-api-base", default=DEFAULT_NAVER_API_BASE)
    parser.add_argument("--naver-business-id", default=DEFAULT_NAVER_BUSINESS_ID)
    parser.add_argument("--naver-room-ids", default=",".join(DEFAULT_NAVER_ROOM_IDS))
    parser.add_argument("--naver-har", default="")
    parser.add_argument("--naver-cookie", default="")
    parser.add_argument("--naver-csrf-token", default="")
    parser.add_argument(
        "--naver-role",
        default="",
        help="Optional x-booking-naver-role override. Leave empty to avoid forcing role header.",
    )
    parser.add_argument("--naver-desc", default="sheet-sync")
    parser.add_argument(
        "--naver-read-sleep-ms",
        type=int,
        default=120,
        help="Delay between Naver daily-schedules read calls per room.",
    )

    parser.add_argument("--request-timeout-sec", type=int, default=20)
    parser.add_argument("--request-sleep-ms", type=int, default=120)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return command_sync_inventory(args)
    except AuditError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 2
    except requests.RequestException as exc:
        print(f"[ERROR] HTTP request failed: {exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
