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

DEFAULT_NAVER_BUSINESS_ID = str(_PAYLOAD["defaultNaverBusinessId"])
DEFAULT_STATION_BRANCH_ID = str(_PAYLOAD["defaultStationBranchId"])
DEFAULT_NAVER_ROOM_IDS = list(_PAYLOAD["defaultNaverRoomIds"])
DEFAULT_STATION_ROOM_IDS = list(_PAYLOAD["defaultStationRoomIds"])

DEFAULT_STATION_API_BASE = str(_PAYLOAD["defaultStationApiBase"])
DEFAULT_NAVER_API_BASE = str(_PAYLOAD["defaultNaverApiBase"])

PROVIDER_TARGET_MAX = {
    key: int(value)
    for key, value in dict(_PAYLOAD["providerTargetMax"]).items()
}

APPLY_BLOCKING_VALIDATION_WARN_CODES = set(_PAYLOAD["applyBlockingValidationWarnCodes"])

APPLY_BLOCKING_STATION_WARNING_CODES = set(_PAYLOAD["applyBlockingStationWarningCodes"])
