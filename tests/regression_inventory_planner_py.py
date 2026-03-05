from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.domain.inventory_planner import build_inventory_planner_summary  # noqa: E402


def build_summary_fixture() -> dict:
    return {
        "reconciliation": {
            "providers": {
                "station": {
                    "rows": [
                        {"date": "2026-03-01", "desired_units": 2, "actual_units": 1, "drift_units": 1},
                        {"date": "2026-03-02", "desired_units": 1, "actual_units": 1, "drift_units": 0},
                    ]
                },
                "naver": {
                    "rows": [
                        {"date": "2026-03-01", "desired_units": 3, "actual_units": 4, "drift_units": -1},
                    ]
                },
            }
        },
        "validation": {
            "station": {"errorCount": 0, "warnCount": 1},
            "naver": {"errorCount": 0, "warnCount": 0},
        },
        "station": {
            "actions": [
                {
                    "date": "2026-03-01",
                    "hasChange": True,
                    "mismatchCount": 1,
                    "payload": {"applyDates": ["2026-03-01"], "roomSettingStocks": [{"roomId": 1, "settingStock": 1}]},
                }
            ]
        },
        "naver": {
            "actions": [
                {
                    "date": "2026-03-01",
                    "type": "stock",
                    "bizItemId": "6556948",
                    "payload": {"startDate": "2026-03-01", "endDate": "2026-03-01", "stock": 1},
                }
            ]
        },
        "policy": {"blocked": False, "issues": []},
    }


def main() -> None:
    fixture = build_summary_fixture()
    dry_run = build_inventory_planner_summary(
        fixture,
        requested_apply=False,
        approve_plan_token="",
    )
    assert dry_run["source_graph"]["sources"]["OTA"]["role"] == "authoritative"
    assert dry_run["source_graph"]["sources"]["PMS"]["role"] == "audit"
    assert dry_run["inventory_authority"]["rule"] == "OTA authoritative / PMS audit / Sheet UI"
    assert dry_run["stages"]["approve"]["required"] is False
    assert dry_run["stages"]["approve"]["approved"] is True
    assert dry_run["totals"]["planned_actions"] == 2

    apply_no_token = build_inventory_planner_summary(
        fixture,
        requested_apply=True,
        approve_plan_token="",
    )
    assert apply_no_token["stages"]["approve"]["required"] is True
    assert apply_no_token["stages"]["approve"]["approved"] is False
    required_token = apply_no_token["stages"]["approve"]["required_token"]
    assert required_token

    apply_with_token = build_inventory_planner_summary(
        fixture,
        requested_apply=True,
        approve_plan_token=required_token,
    )
    assert apply_with_token["stages"]["approve"]["approved"] is True
    assert apply_with_token["stages"]["apply"]["allowed"] is True
    assert apply_with_token["stages"]["approve"]["token_scope"] == "provider_drift+validation+policy+apply_action_scope"

    changed_fixture = build_summary_fixture()
    changed_fixture["station"]["actions"][0]["payload"]["roomSettingStocks"][0]["settingStock"] = 0
    changed = build_inventory_planner_summary(
        changed_fixture,
        requested_apply=True,
        approve_plan_token=required_token,
    )
    assert changed["stages"]["approve"]["required_token"] != required_token
    assert changed["stages"]["approve"]["approved"] is False

    print("regression_inventory_planner_py: OK")


if __name__ == "__main__":
    main()
