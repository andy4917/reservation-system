from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter

from src.domain.sheet_domain import (
    AuditError,
    GRID_FETCH_END_COL_FULL,
    normalize_text,
)


class GoogleSheetsReadonlyClient:
    GRID_FETCH_ROW_WINDOW = 240

    def __init__(self, access_token: str, session: Optional[requests.Session] = None):
        self.access_token = access_token
        self._session = session or self._build_session()

    @staticmethod
    def _build_session() -> requests.Session:
        session = requests.Session()
        adapter = HTTPAdapter(pool_connections=8, pool_maxsize=8, max_retries=2)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def _request(self, method: str, url: str, **kwargs: Any) -> Dict[str, Any]:
        if method.upper() != "GET":
            raise AuditError(
                f"Readonly Sheets client only supports GET requests. blocked_method={method}"
            )
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.access_token}"
        headers["Accept"] = "application/json"
        resp = self._session.request(method, url, headers=headers, timeout=30, **kwargs)
        if resp.status_code >= 400:
            retried_kwargs = self._build_range_parse_retry_kwargs(kwargs, resp)
            if retried_kwargs is not None:
                resp = self._session.request(method, url, headers=headers, timeout=30, **retried_kwargs)
        if resp.status_code >= 400:
            raise AuditError(
                f"Google Sheets API error {resp.status_code}: {resp.text[:500]}"
            )
        return resp.json()

    @staticmethod
    def _unquote_a1_sheet_title(value: str) -> str:
        text = normalize_text(value)
        match = re.match(r"^'((?:[^']|'')+)'!(.+)$", text)
        if not match:
            return text
        title = match.group(1).replace("''", "'")
        remainder = match.group(2)
        return f"{title}!{remainder}"

    @classmethod
    def _build_range_parse_retry_kwargs(cls, kwargs: Dict[str, Any], response: Any) -> Optional[Dict[str, Any]]:
        if response.status_code != 400:
            return None
        body = normalize_text(getattr(response, "text", ""))
        if "Unable to parse range" not in body:
            return None
        params = kwargs.get("params")
        if not isinstance(params, dict) or "ranges" not in params:
            return None

        retried = dict(kwargs)
        next_params = dict(params)
        ranges_value = next_params.get("ranges")
        if isinstance(ranges_value, list):
            updated = [cls._unquote_a1_sheet_title(str(item)) for item in ranges_value]
            if updated == ranges_value:
                return None
            next_params["ranges"] = updated
        elif isinstance(ranges_value, str):
            updated = cls._unquote_a1_sheet_title(ranges_value)
            if updated == ranges_value:
                return None
            next_params["ranges"] = updated
        else:
            return None
        retried["params"] = next_params
        return retried

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
        raise AuditError(f"gid={gid} 에 해당하는 시트 이름을 찾지 못했습니다.")

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
        end_row = max(int(start_row_1based), 1) + self.GRID_FETCH_ROW_WINDOW - 1
        range_a1 = f"{safe_title}!A{start_row_1based}:{end_col}{end_row}"
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
            raise AuditError("시트 응답에서 grid 데이터를 찾을 수 없습니다.")
        return sheets[0]
