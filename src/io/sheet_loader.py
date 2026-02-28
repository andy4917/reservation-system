from __future__ import annotations

from typing import Any, List, Tuple

from src.domain.sheet_domain import (
    AuditError,
    GRID_FETCH_END_COL_FULL,
    GRID_FETCH_END_COL_OPTIMIZED,
)
from src.io.sheets_api import GoogleSheetsReadonlyClient
from src.scan.sheet_scan import SheetMatrix, date_columns_from_batch_header_row, find_date_columns


def load_sheet_matrix_and_dates(
    *,
    client: GoogleSheetsReadonlyClient,
    spreadsheet_id: str,
    sheet_name: str,
    preferred_start_row: int,
    year: int,
    min_expected_date_cols: int = 14,
) -> Tuple[SheetMatrix, int, List[Any]]:
    def _load_matrix(start_row_1based: int, force_full_width: bool = False) -> SheetMatrix:
        end_cols = (
            [GRID_FETCH_END_COL_FULL]
            if force_full_width
            else [GRID_FETCH_END_COL_OPTIMIZED, GRID_FETCH_END_COL_FULL]
        )
        last_exc: Exception | None = None
        for end_col in end_cols:
            try:
                sheet_data_local = client.fetch_grid(
                    spreadsheet_id=spreadsheet_id,
                    sheet_name=sheet_name,
                    start_row_1based=start_row_1based,
                    end_col_a1=end_col,
                )
                grid_data_local = sheet_data_local.get("data", [])
                if not grid_data_local:
                    raise AuditError("Sheet GridData is empty.")
                first_grid_local = grid_data_local[0]
                return SheetMatrix(
                    start_row=int(
                        first_grid_local.get("startRow", max(start_row_1based - 1, 0))
                    ),
                    start_col=int(first_grid_local.get("startColumn", 0)),
                    row_data=first_grid_local.get("rowData", []),
                )
            except AuditError as exc:
                last_exc = exc
                continue
        if last_exc:
            raise last_exc
        raise AuditError("Failed to load sheet matrix.")

    def _resolve_date_columns(matrix_obj: SheetMatrix) -> Tuple[int, List[Any]]:
        resolved_date_row, resolved_date_cols = find_date_columns(
            matrix_obj, matrix_obj.start_row, year
        )
        batch_cols = date_columns_from_batch_header_row(
            client=client,
            spreadsheet_id=spreadsheet_id,
            sheet_name=sheet_name,
            header_row_zero_based=resolved_date_row,
            year=year,
        )
        if len(batch_cols) >= 7:
            weekday_row = resolved_date_row + 1
            for item in batch_cols:
                item.weekday_label = str(
                    matrix_obj.get(weekday_row, item.col).formatted_value or ""
                ).strip()
            resolved_date_cols = batch_cols
        return resolved_date_row, resolved_date_cols

    start_row = max(int(preferred_start_row), 1)
    try:
        matrix = _load_matrix(start_row)
    except AuditError:
        if start_row <= 1:
            raise
        matrix = _load_matrix(1)

    try:
        date_row, date_cols = _resolve_date_columns(matrix)
    except AuditError:
        matrix = _load_matrix(start_row, force_full_width=True)
        try:
            date_row, date_cols = _resolve_date_columns(matrix)
        except AuditError:
            if start_row <= 1:
                raise
            matrix = _load_matrix(1, force_full_width=True)
            date_row, date_cols = _resolve_date_columns(matrix)

    if len(date_cols) < min_expected_date_cols and start_row > 1:
        try:
            matrix_full = _load_matrix(1, force_full_width=True)
            date_row_full, date_cols_full = _resolve_date_columns(matrix_full)
            if len(date_cols_full) > len(date_cols):
                matrix = matrix_full
                date_row = date_row_full
                date_cols = date_cols_full
        except AuditError:
            pass

    return matrix, date_row, date_cols
