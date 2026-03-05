from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core_bridge.runtime import reset_cpp_module_cache  # noqa: E402
from src.domain.sheet_domain import RoomRow  # noqa: E402
from src.scan.sheet_scan import (  # noqa: E402
    SheetMatrix,
    extract_reservation_blocks,
    find_date_columns,
)


def _core_available() -> bool:
    return importlib.util.find_spec("inventory_cpp_core") is not None


def _rgb_from_hex(hex_value: str) -> dict:
    text = hex_value.strip().lower().lstrip("#")
    return {
        "red": int(text[0:2], 16) / 255.0,
        "green": int(text[2:4], 16) / 255.0,
        "blue": int(text[4:6], 16) / 255.0,
    }


def _cell(
    value: str = "",
    *,
    note: str = "",
    hex_color: str | None = None,
) -> dict:
    raw = {"formattedValue": value}
    if note:
        raw["note"] = note
    if hex_color:
        raw["effectiveFormat"] = {"backgroundColor": _rgb_from_hex(hex_color)}
    return raw


def _build_row_data() -> list:
    header = [_cell("") for _ in range(9)]
    weekdays = [_cell("") for _ in range(9)]
    room = [_cell("") for _ in range(9)]

    for idx, label in enumerate(["3/1", "3/2", "3/3", "3/4", "3/5", "3/6", "3/7"], start=2):
        header[idx] = _cell(label)
    for idx, wd in enumerate(["일", "월", "화", "수", "목", "금", "토"], start=2):
        weekdays[idx] = _cell(wd)

    room[0] = _cell("Urban Spa Suite 6in")
    room[1] = _cell("1301")
    room[2] = _cell("100000", note="예약번호: AG123456\n국적 및 박수: KR 2박", hex_color="ea9999")
    room[3] = _cell("", note="예약번호: AG123456\n국적 및 박수: KR 2박", hex_color="ea9999")
    room[4] = _cell("VIP")
    room[5] = _cell("", hex_color="ffffff")
    room[6] = _cell("", hex_color="00ff00")
    room[7] = _cell("120000", note="예약번호: BG765432", hex_color="6aa84f")
    room[8] = _cell("")

    return [{"values": header}, {"values": weekdays}, {"values": room}]


def _build_room_rows() -> dict[int, RoomRow]:
    return {
        66: RoomRow(
            row=66,
            room_type="Urban Spa Suite 6in",
            room_no="1301",
            capacity=6,
            branch="COEX",
            building="B",
            room_number="1301",
            sheet_room_no="1301",
            canonical_id="COEX-B-1301",
            pms_room_no="1301",
            room_type_source="explicit",
            raw_text="Urban Spa Suite 6in",
        )
    }


def _serialize_matrix(matrix: SheetMatrix) -> list[tuple]:
    rows = []
    for (row, col), cell in matrix.cells.items():
        rows.append(
            (
                int(row),
                int(col),
                str(cell.formatted_value or ""),
                str(cell.note or ""),
                str(cell.background_hex or "").lower(),
            )
        )
    return sorted(rows)


def _serialize_date_cols(date_cols: list) -> list[tuple]:
    return [
        (
            int(item.col),
            item.date.isoformat(),
            str(item.label or ""),
            str(item.weekday_label or ""),
        )
        for item in date_cols
    ]


def _serialize_blocks(blocks: list) -> list[tuple]:
    out = []
    for b in blocks:
        out.append(
            (
                int(b.row),
                str(b.room_type or ""),
                str(b.room_no or ""),
                int(b.start_col),
                int(b.end_col),
                b.checkin.isoformat() if b.checkin else "",
                b.checkout.isoformat() if b.checkout else "",
                int(b.nights),
                int(b.price) if isinstance(b.price, int) else None,
                str(b.note or ""),
                str(b.reservation_no or "") or None,
                str(b.reservation_key or "") or None,
                str(b.branch or ""),
                str(b.channel or ""),
                str(b.color_hex or "") or None,
                tuple(int(x) for x in (b.source_columns or [])),
                str(b.nationality_nights or ""),
                str(b.group_key or ""),
                int(b.part_index),
                int(b.parts_total),
                bool(b.month_split),
            )
        )
    return out


def _serialize_daily(rows: list) -> list[tuple]:
    return [
        (
            item.date.isoformat(),
            item.weekday,
            item.branch,
            item.occupied,
            item.blocked,
            item.vacant,
            item.total_rooms,
            item.vac,
            item.vip,
            item.marketing,
            item.ooo,
            item.sold,
            item.unknown_or_other,
        )
        for item in rows
    ]


def _run_once(mode: str) -> tuple:
    os.environ["INVENTORY_CPP_MODE"] = mode
    os.environ["INVENTORY_CPP_MODULE"] = "inventory_cpp_core"
    reset_cpp_module_cache()

    matrix = SheetMatrix(start_row=64, start_col=0, row_data=_build_row_data())
    date_row, date_cols = find_date_columns(matrix, start_row=matrix.start_row, year=2026)
    blocks, meta = extract_reservation_blocks(matrix, date_cols, _build_room_rows())

    return (
        _serialize_matrix(matrix),
        int(date_row),
        _serialize_date_cols(date_cols),
        _serialize_blocks(blocks),
        {
            "daily_all": _serialize_daily(meta.get("daily_all", [])),
            "daily_by_branch": _serialize_daily(meta.get("daily_by_branch", [])),
            "error_counts": dict(meta.get("error_counts", {})),
            "errors": list(meta.get("errors", [])),
            "long_tail_ota_candidates": list(meta.get("long_tail_ota_candidates", [])),
            "long_tail_ota_counts": dict(meta.get("long_tail_ota_counts", {})),
            "branch_assignment_mode": meta.get("branch_assignment_mode"),
            "branch_keys": list(meta.get("branch_keys", [])),
            "branch_markers": list(meta.get("branch_markers", [])),
            "branch_segments": list(meta.get("branch_segments", [])),
            "branch_room_totals": dict(meta.get("branch_room_totals", {})),
            "total_rooms_detected": int(meta.get("total_rooms_detected", 0)),
            "total_rooms_expected": int(meta.get("total_rooms_expected", 0)),
            "chunk_mode_enabled": bool(meta.get("chunk_mode_enabled", False)),
        },
    )


def main() -> None:
    if not _core_available():
        print("regression_cpp_sheet_scan_parity_py: SKIP (inventory_cpp_core not built)")
        return

    old_mode = os.getenv("INVENTORY_CPP_MODE")
    old_module = os.getenv("INVENTORY_CPP_MODULE")
    try:
        off_result = _run_once("off")
        required_result = _run_once("required")

        assert required_result == off_result
        print("regression_cpp_sheet_scan_parity_py: OK")
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
