from __future__ import annotations

import json
import re
from pathlib import Path


def _load_sync_policy_payload() -> dict:
    candidate_paths = [
        Path(__file__).resolve().parents[1] / "shared" / "syncPolicy.js",
        Path(__file__).resolve().parents[2] / "extension" / "src" / "shared" / "syncPolicy.js",
    ]
    source_path = next((path for path in candidate_paths if path.exists()), candidate_paths[0])
    source = source_path.read_text(encoding="utf-8")
    match = re.search(r"const POLICY_JSON = `(?P<payload>\{.*?\})`;", source, re.S)
    if not match:
        raise RuntimeError(f"POLICY_JSON not found in {source_path}")
    return json.loads(match.group("payload"))


_PAYLOAD = _load_sync_policy_payload()

SHEET_DEFAULTS = dict(_PAYLOAD["sheetDefaults"])
POLICY_SPREADSHEET_ID = str(SHEET_DEFAULTS["spreadsheetId"])
POLICY_SHEET_NAME = str(SHEET_DEFAULTS["sheetName"])
POLICY_SHEET_GID = int(SHEET_DEFAULTS["sheetGid"])
POLICY_START_ROW = int(SHEET_DEFAULTS["startRow"])
POLICY_SHEET_YEAR = int(SHEET_DEFAULTS["year"])
POLICY_GOOGLE_CLIENT_ID = str(SHEET_DEFAULTS["googleClientId"])
POLICY_GOOGLE_SCOPE = str(SHEET_DEFAULTS["googleScope"])
POLICY_REDIRECT_URI = str(SHEET_DEFAULTS["redirectUri"])
POLICY_TOKEN_FILE = str(SHEET_DEFAULTS["tokenFile"])
POLICY_PKCE_FILE = str(SHEET_DEFAULTS["pkceFile"])

POLICY_NAVER_BUSINESS_ID = str(_PAYLOAD["defaultNaverBusinessId"])
POLICY_STATION_BRANCH_ID = str(_PAYLOAD["defaultStationBranchId"])
POLICY_NAVER_ROOM_IDS = list(_PAYLOAD["defaultNaverRoomIds"])
POLICY_STATION_ROOM_IDS = list(_PAYLOAD["defaultStationRoomIds"])

POLICY_STATION_API_BASE = str(_PAYLOAD["defaultStationApiBase"])
POLICY_NAVER_API_BASE = str(_PAYLOAD["defaultNaverApiBase"])
BRIDGE_DEFAULTS = dict(_PAYLOAD["bridge"])
POLICY_BRIDGE_HOST = str(BRIDGE_DEFAULTS["host"])
POLICY_BRIDGE_PORT = int(BRIDGE_DEFAULTS["port"])
POLICY_BRIDGE_UPDATE_PATH = str(BRIDGE_DEFAULTS["updatePath"])
POLICY_BRIDGE_STATE_PATH = str(BRIDGE_DEFAULTS["statePath"])

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
