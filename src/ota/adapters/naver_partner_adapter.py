from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests

from src.ota.base import OTAAdapter, OTAAdapterError
from src.ota.models import Inventory, Reservation


@dataclass(frozen=True)
class NaverPartnerAdapterConfig:
    base_url: str
    business_id: str
    headers: Dict[str, str]
    timeout_sec: int = 20


class NaverPartnerAdapter(OTAAdapter):
    provider = "NAVER"

    def __init__(self, session: requests.Session, config: NaverPartnerAdapterConfig) -> None:
        self._session = session
        self._config = config

    def fetch_reservations(self, start_date: str, end_date: str) -> List[Reservation]:
        return []

    def fetch_changes(self, since: str) -> List[Reservation]:
        return []

    def cancelled_reservations(self, start_date: str, end_date: str) -> List[Reservation]:
        return []

    def get_inventory(
        self,
        start_date: str,
        end_date: str,
        provider_item_ids: Optional[List[str]] = None,
    ) -> List[Inventory]:
        room_ids = [str(item).strip() for item in (provider_item_ids or []) if str(item).strip()]
        if not room_ids:
            return []

        rows: List[Inventory] = []
        for room_id in room_ids:
            payload = self._request_json(
                "GET",
                (
                    f"{self._config.base_url.rstrip('/')}/v3.0/businesses/{self._config.business_id}"
                    f"/biz-items/{room_id}/daily-schedules"
                ),
                params={
                    "startDateTime": f"{start_date}T00:00:00",
                    "endDateTime": f"{end_date}T00:00:00",
                },
            )
            if not isinstance(payload, dict):
                continue
            for date_key, value in payload.items():
                if not isinstance(value, dict):
                    continue
                day = str(date_key).strip()[:10]
                if not day:
                    continue
                stock = value.get("stock")
                if stock is None:
                    stock = value.get("availableStock")
                stock_i = int(stock) if isinstance(stock, int) else 0
                is_sale_day = value.get("isSaleDay")
                if not isinstance(is_sale_day, bool):
                    is_sale_day = stock_i > 0
                rows.append(
                    Inventory(
                        provider_item_id=room_id,
                        date=day,
                        stock=max(stock_i, 0),
                        meta={"is_sale_day": bool(is_sale_day)},
                    )
                )
        return rows

    def _request_json(
        self,
        method: str,
        url: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        response = self._session.request(
            method=method.upper(),
            url=url,
            headers=self._config.headers,
            timeout=self._config.timeout_sec,
            params=params,
        )
        if not response.ok:
            body = response.text
            raise OTAAdapterError(
                f"HTTP {response.status_code} {method.upper()} {url} failed: {body[:500]}"
            )

        text = response.text.strip()
        if not text:
            return {}
        try:
            return json.loads(text)
        except Exception as exc:  # noqa: BLE001
            raise OTAAdapterError(f"Invalid JSON payload: {url}") from exc
