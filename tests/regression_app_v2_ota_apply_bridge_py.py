from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write_fixture() -> Path:
    payload = {
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
    handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False)
    json.dump(payload, handle, ensure_ascii=False)
    handle.flush()
    handle.close()
    return Path(handle.name)


def run_bridge(*extra_args: str) -> dict:
    fixture_path = write_fixture()
    result = subprocess.run(
        [
            "python3",
            str(ROOT / "scripts" / "app_v2_ota_apply_bridge.py"),
            "--branch",
            "COEX",
            "--start-date",
            "2026-04-04",
            "--end-date",
            "2026-04-04",
            "--summary-fixture",
            str(fixture_path),
            *extra_args,
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    return json.loads(result.stdout)


def main() -> None:
    dry_run = run_bridge()
    assert dry_run["mode"] == "apply"
    assert dry_run["engineStatus"] == "planned"
    assert dry_run["planToken"] == "token-123"
    assert dry_run["requiresApproval"] is True
    assert dry_run["applyAllowed"] is False
    assert dry_run["issueCount"] == 2
    assert len(dry_run["rows"]) == 2

    approved = run_bridge("--approve-plan-token", "token-123", "--execute-apply")
    assert approved["requiresApproval"] is True
    assert approved["applyAllowed"] is True
    assert "가능" in approved["summary"]

    print("regression_app_v2_ota_apply_bridge_py: OK")


if __name__ == "__main__":
    main()
