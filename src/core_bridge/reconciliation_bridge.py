from __future__ import annotations

from typing import Any, Dict, List

from src.core_bridge.runtime import load_cpp_module


def summarize_station_actual_units_by_date(
    station_rows: List[Dict[str, Any]],
    room_ids: List[str],
) -> Dict[str, int]:
    core = load_cpp_module()
    result = core.reconciliation_compute(
        {
            "op": "summarize_station_actual_units_by_date",
            "station_rows": station_rows,
            "room_ids": room_ids,
        }
    )
    actual = result.get("actual_units_by_date") if isinstance(result, dict) else {}
    if not isinstance(actual, dict):
        return {}
    return {str(day): int(actual[day]) for day in actual.keys()}


def summarize_naver_actual_units_by_date(
    current_by_room: Dict[str, Dict[str, Dict[str, Any]]],
    room_ids: List[str],
) -> Dict[str, int]:
    core = load_cpp_module()
    result = core.reconciliation_compute(
        {
            "op": "summarize_naver_actual_units_by_date",
            "current_by_room": current_by_room,
            "room_ids": room_ids,
        }
    )
    actual = result.get("actual_units_by_date") if isinstance(result, dict) else {}
    if not isinstance(actual, dict):
        return {}
    return {str(day): int(actual[day]) for day in actual.keys()}


def build_provider_reconciliation(
    provider_key: str,
    desired_units_by_date: Dict[str, int],
    actual_units_by_date: Dict[str, int],
    action_stats_by_date: Dict[str, Dict[str, int]],
) -> Dict[str, Any]:
    core = load_cpp_module()
    result = core.reconciliation_compute(
        {
            "op": "build_provider_reconciliation",
            "provider_key": provider_key,
            "desired_units_by_date": desired_units_by_date,
            "actual_units_by_date": actual_units_by_date,
            "action_stats_by_date": action_stats_by_date,
        }
    )
    return dict(result) if isinstance(result, dict) else {}
