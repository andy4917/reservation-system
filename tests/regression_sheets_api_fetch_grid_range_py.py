from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.io.sheets_api import GoogleSheetsReadonlyClient


class _FakeSession:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def request(self, method, url, headers=None, timeout=None, **kwargs):
        self.calls.append(
            {
                "method": method,
                "url": url,
                "headers": dict(headers or {}),
                "timeout": timeout,
                "params": dict(kwargs.get("params") or {}),
            }
        )

        class _Response:
            status_code = 200

            @staticmethod
            def json():
                return {"sheets": [{"properties": {"title": "강남"}, "data": [{"startRow": 0, "startColumn": 0, "rowData": []}]}]}

        return _Response()


class _FallbackSession:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def request(self, method, url, headers=None, timeout=None, **kwargs):
        call = {
            "method": method,
            "url": url,
            "headers": dict(headers or {}),
            "timeout": timeout,
            "params": dict(kwargs.get("params") or {}),
        }
        self.calls.append(call)

        if len(self.calls) == 1:
            class _BadResponse:
                status_code = 400
                text = "Unable to parse range: '강남'!A1:ZZ240"

                @staticmethod
                def json():
                    return {}

            return _BadResponse()

        class _GoodResponse:
            status_code = 200

            @staticmethod
            def json():
                return {"sheets": [{"properties": {"title": "강남"}, "data": [{"startRow": 0, "startColumn": 0, "rowData": []}]}]}

        return _GoodResponse()


def main() -> None:
    session = _FakeSession()
    client = GoogleSheetsReadonlyClient("token", session=session)
    client.fetch_grid(
        spreadsheet_id="spreadsheet-id",
        sheet_name="강남",
        start_row_1based=1,
        end_col_a1="ZZ",
    )

    assert len(session.calls) == 1
    params = session.calls[0]["params"]
    assert params["ranges"] == "'강남'!A1:ZZ240"
    assert params["includeGridData"] == "true"
    assert "Authorization" in session.calls[0]["headers"]

    fallback_session = _FallbackSession()
    fallback_client = GoogleSheetsReadonlyClient("token", session=fallback_session)
    fallback_client.fetch_grid(
        spreadsheet_id="spreadsheet-id",
        sheet_name="강남",
        start_row_1based=1,
        end_col_a1="ZZ",
    )
    assert len(fallback_session.calls) == 2
    assert fallback_session.calls[0]["params"]["ranges"] == "'강남'!A1:ZZ240"
    assert fallback_session.calls[1]["params"]["ranges"] == "강남!A1:ZZ240"
    print("regression_sheets_api_fetch_grid_range_py: OK")


if __name__ == "__main__":
    main()
