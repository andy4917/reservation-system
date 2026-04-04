from __future__ import annotations

from typing import Any, Dict, List

from src.core_bridge.runtime import load_cpp_module


def allocate_room_units(
    room_ids: List[str],
    current_stock_by_room: Dict[str, int],
    target_units: int,
) -> Dict[str, int]:
    core = load_cpp_module()
    result = core.allocation_compute(
        {
            "mode": "binary",
            "room_ids": room_ids,
            "current_stock_by_room": current_stock_by_room,
            "target_units": target_units,
        }
    )
    return _normalize_allocation(result)


def allocate_room_units_flexible(
    room_ids: List[str],
    current_stock_by_room: Dict[str, int],
    target_units: int,
) -> Dict[str, int]:
    core = load_cpp_module()
    result = core.allocation_compute(
        {
            "mode": "flexible",
            "room_ids": room_ids,
            "current_stock_by_room": current_stock_by_room,
            "target_units": target_units,
        }
    )
    return _normalize_allocation(result)


def _normalize_allocation(result: Any) -> Dict[str, int]:
    if not isinstance(result, dict):
        return {}
    return {str(room_id): int(stock) for room_id, stock in result.items()}
