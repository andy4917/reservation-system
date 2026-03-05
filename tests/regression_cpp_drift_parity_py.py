from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core_bridge.runtime import reset_cpp_module_cache  # noqa: E402
from src.domain.inventory_planner import (  # noqa: E402
    _build_provider_plan,
    _build_provider_plan_py,
    build_inventory_planner_summary,
)


def _core_available() -> bool:
    return importlib.util.find_spec("inventory_cpp_core") is not None


def _build_summary_fixture() -> dict:
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
    if not _core_available():
        print("regression_cpp_drift_parity_py: SKIP (inventory_cpp_core not built)")
        return

    old_mode = os.getenv("INVENTORY_CPP_MODE")
    old_module = os.getenv("INVENTORY_CPP_MODULE")
    try:
        os.environ["INVENTORY_CPP_MODE"] = "required"
        os.environ["INVENTORY_CPP_MODULE"] = "inventory_cpp_core"
        reset_cpp_module_cache()

        reconciliation = {
            "rows": [
                {"date": "2026-03-01", "desired_units": 2, "actual_units": 1, "drift_units": 1},
                {"date": "2026-03-02", "desired_units": 1, "actual_units": 1, "drift_units": 0},
            ]
        }
        py_plan = _build_provider_plan_py("station", reconciliation)
        cpp_plan = _build_provider_plan("station", reconciliation)
        assert cpp_plan == py_plan

        fixture = _build_summary_fixture()

        os.environ["INVENTORY_CPP_MODE"] = "off"
        reset_cpp_module_cache()
        summary_off = build_inventory_planner_summary(fixture, requested_apply=True, approve_plan_token="")

        os.environ["INVENTORY_CPP_MODE"] = "required"
        reset_cpp_module_cache()
        summary_cpp = build_inventory_planner_summary(fixture, requested_apply=True, approve_plan_token="")

        assert summary_cpp == summary_off
        assert summary_cpp["stages"]["approve"]["required_token"] == summary_off["stages"]["approve"]["required_token"]

        print("regression_cpp_drift_parity_py: OK")
    finally:
        if old_mode is None:
            os.environ.pop("INVENTORY_CPP_MODE", None)
        else:
            os.environ["INVENTORY_CPP_MODE"] = old_mode
        if old_module is None:
            os.environ.pop("INVENTORY_CPP_MODULE", None)
        else:
            os.environ["INVENTORY_CPP_MODULE"] = old_module
        reset_cpp_module_cache()


if __name__ == "__main__":
    main()
