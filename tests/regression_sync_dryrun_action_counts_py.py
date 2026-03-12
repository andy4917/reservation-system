from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.domain.inventory_planner import build_inventory_planner_summary
from reservation_sheet_sync import summarize_station_action_stats_by_date


def main() -> None:
    summary = {
        "reconciliation": {
            "providers": {
                "station": {
                    "rows": [
                        {
                            "date": "2026-03-07",
                            "desired_units": 0,
                            "actual_units": 0,
                            "drift_units": 0,
                            "action_count": 1,
                        }
                    ]
                },
                "naver": {"rows": []},
            }
        },
        "validation": {
            "station": {"errorCount": 0, "warnCount": 0},
            "naver": {"errorCount": 0, "warnCount": 0},
        },
        "policy": {"blocked": False},
        "station": {
            "actions": [
                {
                    "date": "2026-03-07",
                    "hasChange": False,
                    "mismatchCount": 0,
                    "payload": {"branchId": 16},
                }
            ]
        },
        "naver": {"actions": []},
    }

    planner = build_inventory_planner_summary(summary, requested_apply=False, approve_plan_token="")
    scope = planner["apply_action_scope"]
    station_stats = summarize_station_action_stats_by_date(summary["station"]["actions"])

    assert scope["station"]["count"] == 0
    assert scope["station"]["candidate_count"] == 1
    assert planner["totals"]["planned_actions"] == 0
    assert station_stats["2026-03-07"]["action_count"] == 0
    assert station_stats["2026-03-07"]["stock_actions"] == 0
    assert station_stats["2026-03-07"]["change_actions"] == 0

    print("regression_sync_dryrun_action_counts_py: OK")


if __name__ == "__main__":
    main()
