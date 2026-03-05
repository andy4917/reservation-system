from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_sync import (  # noqa: E402
    _allocate_room_units_flexible_py,
    _allocate_room_units_py,
    allocate_room_units,
    allocate_room_units_flexible,
)
from src.core_bridge.runtime import reset_cpp_module_cache  # noqa: E402


def _core_available() -> bool:
    return importlib.util.find_spec("inventory_cpp_core") is not None


def main() -> None:
    if not _core_available():
        print("regression_cpp_allocation_parity_py: SKIP (inventory_cpp_core not built)")
        return

    old_mode = os.getenv("INVENTORY_CPP_MODE")
    old_module = os.getenv("INVENTORY_CPP_MODULE")
    try:
        os.environ["INVENTORY_CPP_MODE"] = "required"
        os.environ["INVENTORY_CPP_MODULE"] = "inventory_cpp_core"
        reset_cpp_module_cache()

        cases = [
            (["1", "2"], {"1": 1, "2": 0}, -1),
            (["1", "2"], {"1": 1, "2": 0}, 0),
            (["1", "2"], {"1": 1, "2": 0}, 1),
            (["1", "2"], {"1": 0, "2": 0}, 5),
            ([], {"1": 1}, 3),
        ]

        for room_ids, current_stock, target_units in cases:
            py_binary = _allocate_room_units_py(room_ids, current_stock, target_units)
            cpp_binary = allocate_room_units(room_ids, current_stock, target_units)
            assert cpp_binary == py_binary

            py_flexible = _allocate_room_units_flexible_py(room_ids, current_stock, target_units)
            cpp_flexible = allocate_room_units_flexible(room_ids, current_stock, target_units)
            assert cpp_flexible == py_flexible

        print("regression_cpp_allocation_parity_py: OK")
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
