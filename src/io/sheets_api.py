from __future__ import annotations

import re
from typing import Any, Dict, List

import requests

from src.domain.sheet_domain import (
    AuditError,
    GRID_FETCH_END_COL_FULL,
    normalize_text,
)


class GoogleSheetsReadonlyClient:
    def __init__(self, access_token: str):
        self.access_token = access_token

    def _request(self, method: str, url: str, **kwargs: Any) -> Dict[str, Any]:
        if method.upper() != "GET":
            raise AuditError(
                f"Readonly Sheets client only supports GET requests. blocked_method={method}"
            )
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.access_token}"
        headers["Accept"] = "application/json"
        resp = requests.request(method, url, headers=headers, timeout=30, **kwargs)
        if resp.status_code >= 400:
            raise AuditError(
                f"Google Sheets API error {resp.status_code}: {resp.text[:500]}"
            )
        return resp.json()

    def resolve_sheet_name_by_gid(self, spreadsheet_id: str, gid: int) -> str:
        url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
        params = {"fields": "sheets(properties(sheetId,title))"}
        data = self._request("GET", url, params=params)
        for sheet in data.get("sheets", []):
            props = sheet.get("properties", {})
            if props.get("sheetId") == gid:
                title = props.get("title")
                if title:
                    return title
        raise AuditError(f"gid={gid} ???대떦?섎뒗 ?쒗듃 ??쓣 李얠? 紐삵뻽?듬땲??")

    def batch_get_values(
        self,
        spreadsheet_id: str,
        ranges: List[str],
        major_dimension: str = "ROWS",
        value_render_option: str = "FORMATTED_VALUE",
    ) -> List[Dict[str, Any]]:
        clean_ranges = [normalize_text(r) for r in ranges if normalize_text(r)]
        if not clean_ranges:
            return []
        url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values:batchGet"
        params: Dict[str, Any] = {
            "majorDimension": major_dimension,
            "valueRenderOption": value_render_option,
        }
        params["ranges"] = clean_ranges
        data = self._request("GET", url, params=params)
        value_ranges = data.get("valueRanges", [])
        return value_ranges if isinstance(value_ranges, list) else []

    def fetch_grid(
        self,
        spreadsheet_id: str,
        sheet_name: str,
        start_row_1based: int,
        end_col_a1: str = GRID_FETCH_END_COL_FULL,
    ) -> Dict[str, Any]:
        escaped_title = str(sheet_name).replace("'", "''")
        safe_title = f"'{escaped_title}'" if re.search(r"[^A-Za-z0-9_]", str(sheet_name)) else str(sheet_name)
        end_col = normalize_text(end_col_a1).upper() or GRID_FETCH_END_COL_FULL
        range_a1 = f"{safe_title}!A{start_row_1based}:{end_col}"
        fields = ",".join(
            [
                "sheets(properties(sheetId,title),",
                "data(startRow,startColumn,rowData(values(",
                "formattedValue,note,",
                "effectiveFormat(backgroundColor),",
                "userEnteredFormat(backgroundColor)",
                "))))",
            ]
        )
        url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
        params = {
            "ranges": range_a1,
            "includeGridData": "true",
            "fields": fields,
        }
        data = self._request("GET", url, params=params)
        sheets = data.get("sheets", [])
        if not sheets:
            raise AuditError("?쒗듃 ?묐떟?먯꽌 ???곗씠?곕? 李얠쓣 ???놁뒿?덈떎.")
        return sheets[0]
