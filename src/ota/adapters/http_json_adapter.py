from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import requests

from src.ota.base import OTAAdapter, OTAAdapterError
from src.ota.models import Inventory, Reservation


@dataclass(frozen=True)
class EndpointSpec:
    path: str
    method: str = "GET"
    response_paths: Tuple[str, ...] = ()


@dataclass(frozen=True)
class QueryParamSpec:
    start_date: str = "startDate"
    end_date: str = "endDate"
    since: str = "since"
    item_ids: str = "itemIds"


@dataclass(frozen=True)
class ReservationFieldSpec:
    reservation_id: Tuple[str, ...]
    room_type: Tuple[str, ...]
    checkin: Tuple[str, ...]
    checkout: Tuple[str, ...]
    nights: Tuple[str, ...]
    status: Tuple[str, ...]


@dataclass(frozen=True)
class InventoryFieldSpec:
    provider_item_id: Tuple[str, ...]
    date: Tuple[str, ...]
    stock: Tuple[str, ...]


def _normalize_status(value: Any) -> str:
    text = str(value or "").strip().upper()
    if not text:
        return "UNKNOWN"
    canceled_tokens = ("CANCEL", "VOID", "REFUND")
    if any(token in text for token in canceled_tokens):
        return "CANCELED"
    if text in ("OK", "BOOKED", "CONFIRMED"):
        return "CONFIRMED"
    return text


def _to_iso_date(value: Any) -> str:
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) >= 10:
        maybe = text[:10]
        try:
            return date.fromisoformat(maybe).isoformat()
        except Exception:  # noqa: BLE001
            pass
    if len(text) == 8 and text.isdigit():
        candidate = f"{text[:4]}-{text[4:6]}-{text[6:8]}"
        try:
            return date.fromisoformat(candidate).isoformat()
        except Exception:  # noqa: BLE001
            return ""
    return ""


def _to_non_negative_int(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return max(value, 0)
    text = str(value or "").strip()
    if not text:
        return 0
    try:
        return max(int(float(text)), 0)
    except Exception:  # noqa: BLE001
        return 0


class HttpJsonOTAAdapter(OTAAdapter):
    def __init__(
        self,
        *,
        session: requests.Session,
        provider: str,
        base_url: str,
        headers: Dict[str, str],
        timeout_sec: int,
        reservations_endpoint: EndpointSpec,
        changes_endpoint: EndpointSpec,
        cancelled_endpoint: EndpointSpec,
        inventory_endpoint: EndpointSpec,
        query_params: QueryParamSpec,
        reservation_fields: ReservationFieldSpec,
        inventory_fields: InventoryFieldSpec,
    ) -> None:
        self.provider = str(provider or "").strip().upper()
        self._session = session
        self._base_url = str(base_url or "").rstrip("/")
        self._headers = dict(headers or {})
        self._timeout_sec = int(timeout_sec)
        self._reservations_endpoint = reservations_endpoint
        self._changes_endpoint = changes_endpoint
        self._cancelled_endpoint = cancelled_endpoint
        self._inventory_endpoint = inventory_endpoint
        self._query_params = query_params
        self._reservation_fields = reservation_fields
        self._inventory_fields = inventory_fields

    def fetch_reservations(self, start_date: str, end_date: str) -> List[Reservation]:
        rows = self._fetch_rows(
            self._reservations_endpoint,
            {
                self._query_params.start_date: start_date,
                self._query_params.end_date: end_date,
            },
        )
        return self._map_reservation_rows(rows, forced_status="")

    def fetch_changes(self, since: str) -> List[Reservation]:
        rows = self._fetch_rows(
            self._changes_endpoint,
            {self._query_params.since: since},
        )
        return self._map_reservation_rows(rows, forced_status="")

    def cancelled_reservations(self, start_date: str, end_date: str) -> List[Reservation]:
        rows = self._fetch_rows(
            self._cancelled_endpoint,
            {
                self._query_params.start_date: start_date,
                self._query_params.end_date: end_date,
            },
        )
        return self._map_reservation_rows(rows, forced_status="CANCELED")

    def get_inventory(
        self,
        start_date: str,
        end_date: str,
        provider_item_ids: Optional[List[str]] = None,
    ) -> List[Inventory]:
        params: Dict[str, Any] = {
            self._query_params.start_date: start_date,
            self._query_params.end_date: end_date,
        }
        item_ids = [str(item).strip() for item in (provider_item_ids or []) if str(item).strip()]
        if item_ids:
            params[self._query_params.item_ids] = ",".join(item_ids)
        rows = self._fetch_rows(self._inventory_endpoint, params)

        out: List[Inventory] = []
        for row in rows:
            provider_item_id = self._extract_first(row, self._inventory_fields.provider_item_id)
            day = _to_iso_date(self._extract_first(row, self._inventory_fields.date))
            stock = _to_non_negative_int(self._extract_first(row, self._inventory_fields.stock))
            if not provider_item_id or not day:
                continue
            out.append(
                Inventory(
                    provider_item_id=provider_item_id,
                    date=day,
                    stock=stock,
                    meta={"provider": self.provider},
                )
            )
        return out

    def _fetch_rows(self, endpoint: EndpointSpec, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        payload = self._request_json(endpoint.method, self._build_url(endpoint.path), params=params)
        for path in endpoint.response_paths:
            rows = self._extract_rows_from_path(payload, path)
            if rows:
                return rows
        if isinstance(payload, list):
            return [row for row in payload if isinstance(row, dict)]
        if isinstance(payload, dict):
            candidates = ("data", "items", "rows", "results", "reservations", "inventory")
            for key in candidates:
                maybe = payload.get(key)
                if isinstance(maybe, list):
                    return [row for row in maybe if isinstance(row, dict)]
                if isinstance(maybe, dict):
                    nested = maybe.get("items")
                    if isinstance(nested, list):
                        return [row for row in nested if isinstance(row, dict)]
        return []

    def _map_reservation_rows(self, rows: Iterable[Dict[str, Any]], forced_status: str) -> List[Reservation]:
        out: List[Reservation] = []
        for row in rows:
            reservation_id = self._extract_first(row, self._reservation_fields.reservation_id)
            checkin = _to_iso_date(self._extract_first(row, self._reservation_fields.checkin))
            checkout = _to_iso_date(self._extract_first(row, self._reservation_fields.checkout))
            room_type = self._extract_first(row, self._reservation_fields.room_type)
            nights_raw = self._extract_first(row, self._reservation_fields.nights)
            nights = _to_non_negative_int(nights_raw)
            if nights <= 0 and checkin and checkout:
                try:
                    nights = max((date.fromisoformat(checkout) - date.fromisoformat(checkin)).days, 0)
                except Exception:  # noqa: BLE001
                    nights = 0
            status = forced_status or _normalize_status(self._extract_first(row, self._reservation_fields.status))
            if not reservation_id:
                continue
            out.append(
                Reservation(
                    reservation_id=reservation_id,
                    provider=self.provider,
                    room_type=room_type,
                    checkin=checkin,
                    checkout=checkout,
                    nights=nights,
                    status=status,
                    meta={"provider": self.provider},
                )
            )
        return out

    def _request_json(
        self,
        method: str,
        url: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        response = self._session.request(
            method=method.upper(),
            url=url,
            headers=self._headers,
            timeout=self._timeout_sec,
            params=params,
        )
        if not response.ok:
            raise OTAAdapterError(
                f"HTTP {response.status_code} {method.upper()} {url} failed: {response.text[:500]}"
            )
        text = response.text.strip()
        if not text:
            return {}
        try:
            return json.loads(text)
        except Exception as exc:  # noqa: BLE001
            raise OTAAdapterError(f"Invalid JSON payload: {url}") from exc

    def _extract_rows_from_path(self, payload: Any, path: str) -> List[Dict[str, Any]]:
        text = str(path or "").strip()
        if not text:
            return []
        current = payload
        for token in text.split("."):
            if not token:
                continue
            if isinstance(current, dict):
                current = current.get(token)
                continue
            return []
        if isinstance(current, list):
            return [row for row in current if isinstance(row, dict)]
        return []

    def _extract_first(self, row: Dict[str, Any], keys: Sequence[str]) -> str:
        for key in keys:
            value = row.get(key)
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
        return ""

    def _build_url(self, path: str) -> str:
        p = str(path or "").strip()
        if not p:
            raise OTAAdapterError(f"{self.provider} endpoint path is empty.")
        if p.startswith("http://") or p.startswith("https://"):
            return p
        if not p.startswith("/"):
            p = f"/{p}"
        return f"{self._base_url}{p}"
