from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.scan.sheet_scan import date_columns_from_batch_header_row


class _RecordingClient:
    def __init__(self) -> None:
        self.ranges: list[str] = []

    def batch_get_values(
        self,
        spreadsheet_id: str,
        ranges: list[str],
        major_dimension: str = "ROWS",
        value_render_option: str = "FORMATTED_VALUE",
    ) -> list[dict]:
        self.ranges = list(ranges)
        return [{"values": [["3/1", "3/2", "3/3"]]}]


def _run_case(sheet_name: str, header_row_zero_based: int) -> tuple[list[str], int]:
    client = _RecordingClient()
    columns = date_columns_from_batch_header_row(
        client=client,
        spreadsheet_id="sheet-id",
        sheet_name=sheet_name,
        header_row_zero_based=header_row_zero_based,
        year=2026,
    )
    return client.ranges, len(columns)


def main() -> None:
    korean_ranges, korean_cols = _run_case("강남", 0)
    assert korean_ranges == ["'강남'!C1:ZZ1"]
    assert korean_cols == 3

    space_ranges, space_cols = _run_case("서울 강남", 4)
    assert space_ranges == ["'서울 강남'!C5:ZZ5"]
    assert space_cols == 3

    ascii_ranges, ascii_cols = _run_case("Sheet1", 1)
    assert ascii_ranges == ["Sheet1!C2:ZZ2"]
    assert ascii_cols == 3

    print("regression_sheet_scan_batch_range_py: OK")


if __name__ == "__main__":
    main()
