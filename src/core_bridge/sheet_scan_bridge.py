from __future__ import annotations

from typing import Any, Dict, List, Tuple

from src.core_bridge.runtime import load_cpp_module


def build_sheet_cells(
    start_row: int,
    start_col: int,
    row_data: List[Dict[str, Any]],
) -> Dict[str, Any]:
    core = load_cpp_module()
    result = core.scan_compute(
        {
            "op": "build_cells",
            "start_row": int(start_row),
            "start_col": int(start_col),
            "row_data": row_data,
        }
    )
    if not isinstance(result, dict):
        return {}
    return result


def find_date_columns(
    formatted_rows: Dict[int, Dict[int, str]],
    start_row: int,
    max_row: int,
    max_col: int,
    year: int,
    *,
    date_header_hint_row: int,
    date_header_hint_col: int,
    date_weekday_hint_row: int,
) -> Tuple[int, List[Dict[str, Any]]]:
    core = load_cpp_module()
    result = core.scan_compute(
        {
            "op": "find_date_columns",
            "formatted_rows": formatted_rows,
            "start_row": int(start_row),
            "max_row": int(max_row),
            "max_col": int(max_col),
            "year": int(year),
            "date_header_hint_row": int(date_header_hint_row),
            "date_header_hint_col": int(date_header_hint_col),
            "date_weekday_hint_row": int(date_weekday_hint_row),
        }
    )
    if not isinstance(result, dict):
        return -1, []

    row = int(result.get("row", -1))
    cols_raw = result.get("cols")
    if not isinstance(cols_raw, list):
        return row, []

    cols: List[Dict[str, Any]] = []
    for item in cols_raw:
        if not isinstance(item, dict):
            continue
        cols.append(item)
    return row, cols


def detect_block_runs(
    events_by_row: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    core = load_cpp_module()

    result = core.scan_compute(
        {
            "op": "detect_block_runs",
            "events_by_row": events_by_row,
        }
    )
    if not isinstance(result, dict):
        return []

    rows = result.get("blocks")
    if not isinstance(rows, list):
        return []

    out: List[Dict[str, Any]] = []
    for item in rows:
        if isinstance(item, dict):
            out.append(item)
    return out
