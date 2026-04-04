from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.app_v2_ota_apply_bridge import build_payload


def make_summary() -> dict:
    return {
        "station": {
            "effective_actions": [
                {
                    "date": "2026-04-04",
                    "hasChange": True,
                    "mismatchCount": 1,
                    "payload": {"applyDates": ["2026-04-04"], "roomSettingStocks": [{"roomId": 1, "settingStock": 1}]},
                }
            ],
        },
        "naver": {
            "effective_actions": [
                {
                    "date": "2026-04-04",
                    "type": "stock",
                    "bizItemId": "6556948",
                    "payload": {"startDate": "2026-04-04", "endDate": "2026-04-04", "stock": 1},
                }
            ],
        },
        "policy": {"blocked": False, "issues": []},
        "inventory_planner": {
            "stages": {
                "approve": {
                    "required": True,
                    "required_token": "token-123",
                    "approved": False,
                },
                "apply": {
                    "requested": False,
                    "allowed": False,
                },
            },
            "totals": {"planned_actions": 2},
        },
    }


def main() -> None:
    dry_run = build_payload(
        SimpleNamespace(
            branch="COEX",
            provider="both",
            spreadsheet="sheet-id",
            sheet_name="2026",
            approve_plan_token="",
        ),
        make_summary(),
    )
    assert dry_run["mode"] == "apply"
    assert dry_run["engineStatus"] == "planned"
    assert dry_run["planToken"] == "token-123"
    assert dry_run["requiresApproval"] is True
    assert dry_run["applyAllowed"] is False
    assert dry_run["issueCount"] == 2
    assert len(dry_run["rows"]) == 2

    approved = build_payload(
        SimpleNamespace(
            branch="COEX",
            provider="both",
            spreadsheet="sheet-id",
            sheet_name="2026",
            approve_plan_token="token-123",
        ),
        make_summary(),
    )
    assert approved["requiresApproval"] is True
    assert approved["applyAllowed"] is True
    assert "가능" in approved["summary"]

    print("regression_app_v2_ota_apply_bridge_py: OK")


if __name__ == "__main__":
    main()
