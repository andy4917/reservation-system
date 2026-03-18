from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.domain import sheet_domain, sync_policy


def load_payload() -> dict:
    source = (ROOT / "extension" / "src" / "shared" / "syncPolicy.js").read_text(encoding="utf-8")
    match = re.search(r"const POLICY_JSON = `(?P<payload>\{.*?\})`;", source, re.S)
    assert match, "POLICY_JSON not found"
    return json.loads(match.group("payload"))


def main() -> None:
    payload = load_payload()
    sheet_defaults = payload["sheetDefaults"]

    assert sync_policy.POLICY_SPREADSHEET_ID == str(sheet_defaults["spreadsheetId"])
    assert sync_policy.POLICY_SHEET_NAME == str(sheet_defaults["sheetName"])
    assert sync_policy.POLICY_START_ROW == int(sheet_defaults["startRow"])
    assert sync_policy.POLICY_SHEET_YEAR == int(sheet_defaults["year"])
    assert sync_policy.POLICY_GOOGLE_CLIENT_ID == str(sheet_defaults["googleClientId"])
    assert sync_policy.POLICY_REDIRECT_URI == str(sheet_defaults["redirectUri"])
    assert sync_policy.POLICY_NAVER_BUSINESS_ID == str(payload["defaultNaverBusinessId"])
    assert sync_policy.POLICY_STATION_BRANCH_ID == str(payload["defaultStationBranchId"])

    assert sheet_domain.DEFAULT_SHEET_ID == sync_policy.POLICY_SPREADSHEET_ID
    assert sheet_domain.DEFAULT_SHEET_NAME == sync_policy.POLICY_SHEET_NAME
    assert sheet_domain.DEFAULT_START_ROW == sync_policy.POLICY_START_ROW
    assert sheet_domain.DEFAULT_CLIENT_ID == sync_policy.POLICY_GOOGLE_CLIENT_ID
    assert sheet_domain.DEFAULT_REDIRECT_URI == sync_policy.POLICY_REDIRECT_URI

    assert not hasattr(sync_policy, "DEFAULT_SPREADSHEET_ID")
    assert not hasattr(sync_policy, "DEFAULT_GOOGLE_CLIENT_ID")
    print("regression_policy_contract_alignment_py: OK")


if __name__ == "__main__":
    main()
