from __future__ import annotations

import json
import re
from pathlib import Path


def _load_sync_policy_payload() -> dict:
    source_path = Path(__file__).resolve().parents[1] / "shared" / "syncPolicy.js"
    source = source_path.read_text(encoding="utf-8")
    match = re.search(r"const POLICY_JSON = `(?P<payload>\{.*?\})`;", source, re.S)
    if not match:
        raise RuntimeError(f"POLICY_JSON not found in {source_path}")
    return json.loads(match.group("payload"))


_PAYLOAD = _load_sync_policy_payload()

SHEET_DEFAULTS = dict(_PAYLOAD["sheetDefaults"])
DEFAULT_SPREADSHEET_ID = str(SHEET_DEFAULTS["spreadsheetId"])
DEFAULT_SHEET_NAME = str(SHEET_DEFAULTS["sheetName"])
DEFAULT_SHEET_GID = int(SHEET_DEFAULTS["sheetGid"])
DEFAULT_START_ROW = int(SHEET_DEFAULTS["startRow"])
DEFAULT_SHEET_YEAR = int(SHEET_DEFAULTS["year"])
DEFAULT_GOOGLE_CLIENT_ID = str(SHEET_DEFAULTS["googleClientId"])
DEFAULT_GOOGLE_SCOPE = str(SHEET_DEFAULTS["googleScope"])
DEFAULT_REDIRECT_URI = str(SHEET_DEFAULTS["redirectUri"])
DEFAULT_TOKEN_FILE = str(SHEET_DEFAULTS["tokenFile"])
DEFAULT_PKCE_FILE = str(SHEET_DEFAULTS["pkceFile"])

DEFAULT_NAVER_BUSINESS_ID = str(_PAYLOAD["defaultNaverBusinessId"])
DEFAULT_STATION_BRANCH_ID = str(_PAYLOAD["defaultStationBranchId"])
DEFAULT_NAVER_ROOM_IDS = list(_PAYLOAD["defaultNaverRoomIds"])
DEFAULT_STATION_ROOM_IDS = list(_PAYLOAD["defaultStationRoomIds"])

DEFAULT_STATION_API_BASE = str(_PAYLOAD["defaultStationApiBase"])
DEFAULT_NAVER_API_BASE = str(_PAYLOAD["defaultNaverApiBase"])
BRIDGE_DEFAULTS = dict(_PAYLOAD["bridge"])
DEFAULT_BRIDGE_HOST = str(BRIDGE_DEFAULTS["host"])
DEFAULT_BRIDGE_PORT = int(BRIDGE_DEFAULTS["port"])
DEFAULT_BRIDGE_UPDATE_PATH = str(BRIDGE_DEFAULTS["updatePath"])
DEFAULT_BRIDGE_STATE_PATH = str(BRIDGE_DEFAULTS["statePath"])

NOTE_CHANNEL_PREFIX = dict(_PAYLOAD["noteChannelPrefix"])
NOTE_CHANNEL_PREFIX_ENABLED = bool(NOTE_CHANNEL_PREFIX["enabled"])
NOTE_CHANNEL_PREFIX_TEMPLATE = str(NOTE_CHANNEL_PREFIX["template"])

ROOM_PRESETS = {
    str(provider): [
        {"id": str(item["id"]), "name": str(item["name"])}
        for item in list(rows)
    ]
    for provider, rows in dict(_PAYLOAD["roomPresets"]).items()
}

ROOM_TYPE_BY_ROOM_NO = {
    str(room_no): str(room_type)
    for room_no, room_type in dict(_PAYLOAD["roomTypeByRoomNo"]).items()
}

PROVIDER_TARGET_MAX = {
    key: int(value)
    for key, value in dict(_PAYLOAD["providerTargetMax"]).items()
}

APPLY_BLOCKING_VALIDATION_WARN_CODES = set(_PAYLOAD["applyBlockingValidationWarnCodes"])

APPLY_BLOCKING_STATION_WARNING_CODES = set(_PAYLOAD["applyBlockingStationWarningCodes"])
