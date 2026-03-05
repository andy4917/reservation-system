from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_sync import (  # noqa: E402
    _summarize_station_actual_units_by_date_py,
    summarize_station_actual_units_by_date,
)
from src.core_bridge.runtime import reset_cpp_module_cache  # noqa: E402


def _core_available() -> bool:
    return importlib.util.find_spec("inventory_cpp_core") is not None


def main() -> None:
    station_rows = [
        {"date": "2026-03-01", "roomId": "1", "stockCount": 1},
        {"date": "2026-03-01", "roomId": "2", "stockCount": 0},
    ]
    room_ids = ["1", "2"]
    expected = _summarize_station_actual_units_by_date_py(station_rows, room_ids)

    old_mode = os.getenv("INVENTORY_CPP_MODE")
    old_module = os.getenv("INVENTORY_CPP_MODULE")
    try:
        os.environ["INVENTORY_CPP_MODE"] = "off"
        os.environ["INVENTORY_CPP_MODULE"] = "inventory_cpp_core"
        reset_cpp_module_cache()
        off_result = summarize_station_actual_units_by_date(station_rows, room_ids)
        assert off_result == expected

        os.environ["INVENTORY_CPP_MODE"] = "auto"
        os.environ["INVENTORY_CPP_MODULE"] = "module_that_does_not_exist_for_test"
        reset_cpp_module_cache()
        auto_result = summarize_station_actual_units_by_date(station_rows, room_ids)
        assert auto_result == expected

        os.environ["INVENTORY_CPP_MODE"] = "required"
        os.environ["INVENTORY_CPP_MODULE"] = "module_that_does_not_exist_for_test"
        reset_cpp_module_cache()
        raised = False
        try:
            summarize_station_actual_units_by_date(station_rows, room_ids)
        except RuntimeError:
            raised = True
        assert raised is True

        if _core_available():
            os.environ["INVENTORY_CPP_MODE"] = "required"
            os.environ["INVENTORY_CPP_MODULE"] = "inventory_cpp_core"
            reset_cpp_module_cache()
            required_result = summarize_station_actual_units_by_date(station_rows, room_ids)
            assert required_result == expected

        print("regression_cpp_wrapper_modes_py: OK")
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
