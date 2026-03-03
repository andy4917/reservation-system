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
    NIGHTS_FIELD_ALIASES,
    PRICE_FIELD_ALIASES,
    RES_NO_FIELD_ALIASES,
    ROOM_FIELD_ALIASES,
    STATUS_FIELD_ALIASES,
    AuditError,
    BRANCH_SPLIT_ROW,
    HarRecord,
    SourceReservation,
    extract_sheet_id,
    infer_year_from_sheet_name,
    classify_reservation_status_bucket,
    has_reservation_audit_anomaly,
    normalize_platform_name,
    normalize_reservation_status,
    normalize_text,
    parse_money_to_int,
    calculate_checkout_from_dates,
)
from src.io.sheets_api import GoogleSheetsReadonlyClient
from src.io.sheet_loader import load_sheet_matrix_and_dates
from src.scan.sheet_scan import (
    SheetMatrix,
    calculate_channel_recommendations,
    calculate_daily_stats,
    calculate_vac_by_room_type,
    extract_inventory_values_by_date,
    extract_reservation_blocks,
    find_inventory_rows,
    map_room_rows,
    parse_note_info,
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
    write_blocks_csv,
    write_cross_validation_csv,
    write_daily_csv,
    write_long_tail_ota_candidates_csv,
    write_recommendations_csv,
    write_room_type_vac_csv,
    write_source_reservations_csv,
)

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

def parse_har_records(har_path: Path) -> List[HarRecord]:
    with har_path.open("r", encoding="utf-8") as f:
        har = json.load(f)
    entries = har.get("log", {}).get("entries", [])
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


def parse_source_reservations_from_har(har_path: Path) -> List[SourceReservation]:
    with har_path.open("r", encoding="utf-8") as f:
        har = json.load(f)
    entries = har.get("log", {}).get("entries", [])
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
                parsed = parse_source_row(obj, source_system=source_system)
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
) -> List[SourceReservation]:
    records: List[SourceReservation] = []

    if har_path:
        path = Path(har_path)
        if path.exists():
            records.extend(parse_source_reservations_from_har(path))
            for hr in parse_har_records(path):
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
        records.extend(parse_source_file(path, source_system, default_channel))

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


def infer_branch_from_source_row(
    row: Dict[str, Any],
    channel_raw: str,
    account: str,
) -> str:
    branch_raw = normalize_text(str(get_first_value_by_alias(row, BRANCH_FIELD_ALIASES) or ""))
    candidates = " ".join(
        part for part in [branch_raw, channel_raw, account] if normalize_text(part)
    ).lower()
    if "coex" in candidates or "코엑스" in candidates:
        return "COEX"
    if "gangnam" in candidates or "강남" in candidates:
        return "GANGNAM"
    if branch_raw.isdigit():
        return f"PROPERTY_{int(branch_raw)}"
    return ""


def is_inactive_reservation_status(status: str) -> bool:
    text = normalize_text(status).upper()
    if not text:
        return False
    if text == "CANCELED":
        return True
    if text.startswith(("CXL", "CNCL", "CANC")):
        return True
    if text in {"CX", "CN"}:
        return True
    return False


def parse_source_row(
    row: Dict[str, Any], source_system: str, default_channel: str = ""
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
    branch = infer_branch_from_source_row(row, channel_raw=channel_raw, account=account)
    reservation_ref = coerce_reservation_no(
        get_first_value_by_alias(row, ["global_rsvn_no", "guest_rsvn_no", "rsvn_seq_no"])
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


def parse_source_file(path: Path, source_system: str, default_channel: str = "") -> List[SourceReservation]:
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
                parsed = parse_source_row(dict(row), source_system, default_channel)
                if parsed:
                    blob_records.append(parsed)
            return blob_records

        if blob_ext in (".json", ".har", ".txt", ".log"):
            data = try_parse_json_text(text)
            if data is None:
                return blob_records
            for obj in iter_json_objects(data):
                parsed = parse_source_row(obj, source_system, default_channel)
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
    room_rows = map_room_rows(matrix, date_cols, scan_row_start=date_row + 2)

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
        "har_records": har_records,
        "har_index": har_index,
    }


def build_analysis_artifacts(args: argparse.Namespace, context: Dict[str, Any]) -> Dict[str, Any]:
    matrix = context["matrix"]
    date_row = context["date_row"]
    date_cols = context["date_cols"]
    room_rows = context["room_rows"]
    har_index = context["har_index"]

    blocks, scan_meta = extract_reservation_blocks(matrix, date_cols, room_rows)
    daily_stats = list(scan_meta.get("daily_all", []))
    daily_branch_stats = list(scan_meta.get("daily_by_branch", []))
    vac_by_room_type = calculate_vac_by_room_type(matrix, date_cols, room_rows)
    source_records = load_source_reservations(
        har_path=args.har,
        wings_file=args.wings_file,
        naver_file=args.naver_file,
        station_file=args.station_file,
        pms_file=args.pms_file,
    )

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

    return {
        "blocks": blocks,
        "scan_meta": scan_meta,
        "daily_stats": daily_stats,
        "daily_branch_stats": daily_branch_stats,
        "vac_by_room_type": vac_by_room_type,
        "source_records": source_records,
        "source_system_counts": Counter(r.source_system for r in source_records),
        "inventory_rows": inventory_rows,
        "channel_reco": channel_reco,
        "issues": reconcile_sheet_vs_har(blocks, har_index) if har_index else [],
        "cross_issues": cross_validate_sheet_vs_sources(blocks, source_records),
        "long_tail_candidates": list(scan_meta.get("long_tail_ota_candidates", [])),
        **ops_artifacts,
    }


def write_analysis_outputs(out_dir: Path, artifacts: Dict[str, Any]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    write_blocks_csv(out_dir / "reservation_blocks.csv", artifacts["blocks"])
    write_daily_csv(out_dir / "vac_daily.csv", artifacts["daily_stats"])
    write_daily_csv(out_dir / "occupancy_daily_by_branch.csv", artifacts["daily_branch_stats"])
    write_room_type_vac_csv(out_dir / "vac_by_room_type.csv", artifacts["vac_by_room_type"])
    write_recommendations_csv(out_dir / "channel_recommendations.csv", artifacts["channel_reco"])
    write_cross_validation_csv(out_dir / "cross_validation_issues.csv", artifacts["cross_issues"])
    write_source_reservations_csv(out_dir / "source_reservations.csv", artifacts["source_records"])
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
            "source_reservations_count": len(artifacts["source_records"]),
            "source_system_counts": dict(artifacts["source_system_counts"]),
        },
        "counts": {
            "reservation_blocks": len(artifacts["blocks"]),
            "daily_rows": len(artifacts["daily_stats"]),
            "daily_branch_rows": len(artifacts["daily_branch_stats"]),
            "reconciliation_issues": len(artifacts["issues"]),
            "cross_validation_issues": len(artifacts["cross_issues"]),
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
        },
        "inventory_rows_found": artifacts["inventory_rows"],
        "derived_reports": {
            **build_ops_summary(artifacts),
        },
        "issues": artifacts["issues"],
        "cross_validation_issues": artifacts["cross_issues"],
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
    write_analysis_outputs(out_dir, artifacts)
    summary = build_analysis_summary(args, analysis_context, artifacts)
    save_json(out_dir / "summary.json", summary)

    print("遺꾩꽍 ?꾨즺")
    print(f"- Reservation blocks: {len(artifacts['blocks'])}")
    print(f"- Occupancy dates (ALL): {len(artifacts['daily_stats'])}")
    print(f"- Occupancy rows (branch): {len(artifacts['daily_branch_stats'])}")
    print(f"- Reconciliation issues: {len(artifacts['issues'])}")
    print(f"- Cross validation source records: {len(artifacts['source_records'])}")
    print(f"- Cross validation issues: {len(artifacts['cross_issues'])}")
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
    parser.add_argument("--out-dir", default="output")
    parser.add_argument("--vac-share-limit", type=int, default=2)
    parser.add_argument("--report-date", default="")
    parser.add_argument("--report-start-date", default="")
    parser.add_argument("--report-end-date", default="")
    parser.add_argument("--ops-sheet-spreadsheet", default="")
    parser.add_argument("--access-token", default="")
    parser.add_argument("--token-file", default=DEFAULT_TOKEN_FILE)
    parser.add_argument("--client-id", default=DEFAULT_CLIENT_ID)
    parser.add_argument("--client-secret", default="")
    parser.add_argument("--no-proxy", action="store_true")


def add_ops_artifact_arguments(parser: argparse.ArgumentParser) -> None:
    add_analyze_arguments(parser)
    parser.add_argument("--blocks-csv", default="")


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
