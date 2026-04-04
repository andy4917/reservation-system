from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_sync import (  # noqa: E402
    _build_provider_reconciliation_py,
    _summarize_naver_actual_units_by_date_py,
    _summarize_station_actual_units_by_date_py,
    build_provider_reconciliation,
    summarize_naver_actual_units_by_date,
    summarize_naver_action_stats_by_date,
    summarize_station_actual_units_by_date,
    summarize_station_action_stats_by_date,
)
from src.core_bridge.runtime import reset_cpp_module_cache  # noqa: E402


def _core_available() -> bool:
    return importlib.util.find_spec("inventory_cpp_core") is not None


def main() -> None:
    assert _core_available(), "inventory_cpp_core must be built"

    old_module = os.getenv("INVENTORY_CPP_MODULE")
    try:
        os.environ["INVENTORY_CPP_MODULE"] = "inventory_cpp_core"
        reset_cpp_module_cache()

        station_rows = [
            {"date": "2026-03-01", "roomId": "1", "stockCount": 1},
            {"date": "2026-03-01", "roomId": "2", "stockCount": 0},
            {"date": "2026-03-02", "roomId": "1", "stockCount": 1},
            {"date": "2026-03-03", "roomId": "3", "stockCount": 9},
        ]
        station_room_ids = ["1", "2"]
        py_station_actual = _summarize_station_actual_units_by_date_py(station_rows, station_room_ids)
        cpp_station_actual = summarize_station_actual_units_by_date(station_rows, station_room_ids)
        assert cpp_station_actual == py_station_actual

        station_actions = [
            {"date": "2026-03-01", "hasChange": True, "mismatchCount": 1},
            {"date": "2026-03-02", "hasChange": False, "mismatchCount": 0},
        ]
        station_stats = summarize_station_action_stats_by_date(station_actions)
        py_station_recon = _build_provider_reconciliation_py(
            "STATION",
            {"2026-03-01": 2, "2026-03-02": 1},
            py_station_actual,
            station_stats,
        )
        cpp_station_recon = build_provider_reconciliation(
            "STATION",
            {"2026-03-01": 2, "2026-03-02": 1},
            cpp_station_actual,
            station_stats,
        )
        assert cpp_station_recon == py_station_recon

        naver_current_by_room = {
            "A": {
                "2026-03-01": {"stock": 1, "isSaleDay": True},
                "2026-03-02": {"stock": 0, "isSaleDay": False},
            },
            "B": {
                "2026-03-01": {"stock": 1, "isSaleDay": True},
                "2026-03-02": {"stock": 1, "isSaleDay": True},
            },
        }
        naver_room_ids = ["A", "B"]
        py_naver_actual = _summarize_naver_actual_units_by_date_py(naver_current_by_room, naver_room_ids)
        cpp_naver_actual = summarize_naver_actual_units_by_date(naver_current_by_room, naver_room_ids)
        assert cpp_naver_actual == py_naver_actual

        naver_actions = [
            {"type": "stock", "date": "2026-03-01", "countAsMismatch": True},
            {"type": "sale-day", "date": "2026-03-01", "countAsMismatch": True},
            {"type": "stock", "date": "2026-03-02", "countAsMismatch": False},
        ]
        naver_stats = summarize_naver_action_stats_by_date(naver_actions)
        py_naver_recon = _build_provider_reconciliation_py(
            "NAVER",
            {"2026-03-01": 2, "2026-03-02": 2},
            py_naver_actual,
            naver_stats,
        )
        cpp_naver_recon = build_provider_reconciliation(
            "NAVER",
            {"2026-03-01": 2, "2026-03-02": 2},
            cpp_naver_actual,
            naver_stats,
        )
        assert cpp_naver_recon == py_naver_recon

        print("regression_cpp_reconciliation_parity_py: OK")
    finally:
        if old_module is None:
            os.environ.pop("INVENTORY_CPP_MODULE", None)
        else:
            os.environ["INVENTORY_CPP_MODULE"] = old_module
        reset_cpp_module_cache()


if __name__ == "__main__":
    main()
