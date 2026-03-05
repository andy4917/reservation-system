from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.channel_executors import NaverExecutor, StationExecutor
from src.ota.adapters import NaverPartnerAdapter, NaverPartnerAdapterConfig
from src.ota.registry import list_ota_adapters


class FakeResponse:
    def __init__(self, status_code: int, payload: Dict[str, Any]) -> None:
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self.text = json.dumps(payload, ensure_ascii=False)


class FakeSession:
    def __init__(self, payload_by_room: Dict[str, Dict[str, Any]]) -> None:
        self.payload_by_room = payload_by_room
        self.calls: List[Dict[str, Any]] = []

    def request(self, **kwargs: Any) -> FakeResponse:
        url = str(kwargs.get("url", ""))
        self.calls.append(kwargs)
        m = re.search(r"/biz-items/([^/]+)/daily-schedules", url)
        if not m:
            return FakeResponse(404, {"error": "not found"})
        room_id = m.group(1)
        return FakeResponse(200, self.payload_by_room.get(room_id, {}))


def main() -> None:
    mapping = list_ota_adapters()
    assert mapping["booking"] == "BOOKING"
    assert mapping["agoda"] == "AGODA"
    assert mapping["trip"] == "TRIP"
    assert mapping["airbnb"] == "AIRBNB"

    fake_session = FakeSession(
        {
            "6556948": {
                "2026-03-01": {"stock": 2, "isSaleDay": True},
                "2026-03-02": {"availableStock": 0, "isSaleDay": False},
            }
        }
    )
    adapter = NaverPartnerAdapter(
        session=fake_session,
        config=NaverPartnerAdapterConfig(
            base_url="https://api-partner.booking.naver.com",
            business_id="1356779",
            headers={"Cookie": "x=y"},
            timeout_sec=5,
        ),
    )
    inventory_rows = adapter.get_inventory(
        start_date="2026-03-01",
        end_date="2026-03-02",
        provider_item_ids=["6556948"],
    )
    assert len(inventory_rows) == 2
    first = inventory_rows[0]
    second = inventory_rows[1]
    assert first.provider_item_id == "6556948"
    assert first.date == "2026-03-01"
    assert first.stock == 2
    assert first.meta["is_sale_day"] is True
    assert second.date == "2026-03-02"
    assert second.stock == 0
    assert second.meta["is_sale_day"] is False
    assert len(fake_session.calls) == 1

    captured_calls: List[Dict[str, Any]] = []

    def fake_request_json(
        session: Any,
        method: str,
        url: str,
        headers: Dict[str, str],
        timeout_sec: int,
        params: Dict[str, Any] | None = None,
        payload: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        captured_calls.append(
            {
                "method": method,
                "url": url,
                "headers": headers,
                "timeout_sec": timeout_sec,
                "params": params,
                "payload": payload,
            }
        )
        return {}

    station_executor = StationExecutor(
        base_url="https://api.admin-stationbyuhc.com",
        branch_id="18",
        timeout_sec=7,
        sleep_ms=0,
    )
    station_results = station_executor.apply_inventory_actions(
        session=object(),
        headers={"Authorization": "Bearer token"},
        actions=[
            {"date": "2026-03-01", "hasChange": False, "payload": {}},
            {"date": "2026-03-02", "hasChange": True, "payload": {"applyDates": ["2026-03-02"]}},
        ],
        request_json=fake_request_json,
    )
    assert station_results[0]["status"] == "SKIPPED_NO_CHANGE"
    assert station_results[1]["status"] == "APPLIED"
    assert captured_calls[0]["method"] == "PATCH"
    assert "/admin/branch/18/apply/price-set" in captured_calls[0]["url"]

    naver_executor = NaverExecutor(
        base_url="https://api-partner.booking.naver.com",
        business_id="1356779",
        timeout_sec=9,
        sleep_ms=0,
    )
    naver_results = naver_executor.apply_inventory_actions(
        session=object(),
        headers={"Cookie": "x=y"},
        actions=[
            {
                "type": "stock",
                "bizItemId": "6556948",
                "date": "2026-03-01",
                "payload": {"stock": 1},
            },
            {
                "type": "sale-day",
                "bizItemId": "6556948",
                "date": "2026-03-01",
                "payload": {"isSaleDay": True},
            },
        ],
        request_json=fake_request_json,
    )
    assert len(naver_results) == 2
    assert naver_results[0]["status"] == "APPLIED"
    assert "stock-schedules" in captured_calls[1]["url"]
    assert "sale-schedules" in captured_calls[2]["url"]

    print("regression_ota_adapter_layer_py: OK")


if __name__ == "__main__":
    main()
