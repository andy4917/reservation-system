from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import requests

from src.ota.base import OTAAdapter
from src.ota.adapters.http_json_adapter import (
    EndpointSpec,
    HttpJsonOTAAdapter,
    InventoryFieldSpec,
    QueryParamSpec,
    ReservationFieldSpec,
)
from src.ota.adapters.wings_har_adapter import WingsHarAdapter, WingsHarAdapterConfig
from src.ota.models import Inventory, Reservation


@dataclass(frozen=True)
class BookingAdapterConfig:
    source_mode: str = "wings_har"
    base_url: str = ""
    headers: Dict[str, str] = field(default_factory=dict)
    timeout_sec: int = 20
    wings_har_paths: List[str] = field(default_factory=list)
    reservations_endpoint: EndpointSpec = field(
        default_factory=lambda: EndpointSpec(
            path="/reservations",
            method="GET",
            response_paths=("data.reservations", "reservations", "data.items", "items"),
        )
    )
    changes_endpoint: EndpointSpec = field(
        default_factory=lambda: EndpointSpec(
            path="/reservations/changes",
            method="GET",
            response_paths=("data.changes", "changes", "data.items", "items"),
        )
    )
    cancelled_endpoint: EndpointSpec = field(
        default_factory=lambda: EndpointSpec(
            path="/reservations/cancelled",
            method="GET",
            response_paths=("data.cancelled", "cancelled", "data.items", "items"),
        )
    )
    inventory_endpoint: EndpointSpec = field(
        default_factory=lambda: EndpointSpec(
            path="/inventory",
            method="GET",
            response_paths=("data.inventory", "inventory", "data.items", "items"),
        )
    )
    query_params: QueryParamSpec = field(default_factory=QueryParamSpec)


class BookingAdapter(OTAAdapter):
    provider = "BOOKING"

    def __init__(self, session: requests.Session, config: BookingAdapterConfig) -> None:
        mode = normalize_mode(config.source_mode)
        if mode == "wings_har":
            self._impl = WingsHarAdapter(
                WingsHarAdapterConfig(provider=self.provider, har_paths=config.wings_har_paths)
            )
            return
        self._impl = HttpJsonOTAAdapter(
            session=session,
            provider=self.provider,
            base_url=config.base_url,
            headers=config.headers,
            timeout_sec=config.timeout_sec,
            reservations_endpoint=config.reservations_endpoint,
            changes_endpoint=config.changes_endpoint,
            cancelled_endpoint=config.cancelled_endpoint,
            inventory_endpoint=config.inventory_endpoint,
            query_params=config.query_params,
            reservation_fields=ReservationFieldSpec(
                reservation_id=("reservation_id", "reservationId", "booking_id", "bookingId", "id"),
                room_type=("room_type", "roomType", "room_name", "roomName"),
                checkin=("checkin", "checkIn", "arrival_date", "arrivalDate"),
                checkout=("checkout", "checkOut", "departure_date", "departureDate"),
                nights=("nights", "stayNights", "night"),
                status=("status", "reservationStatus", "bookingStatus"),
            ),
            inventory_fields=InventoryFieldSpec(
                provider_item_id=("provider_item_id", "providerItemId", "room_id", "roomId", "id"),
                date=("date", "day", "stayDate"),
                stock=("stock", "available", "availability", "remaining"),
            ),
        )

    def fetch_reservations(self, start_date: str, end_date: str) -> List[Reservation]:
        return self._impl.fetch_reservations(start_date, end_date)

    def fetch_changes(self, since: str) -> List[Reservation]:
        return self._impl.fetch_changes(since)

    def cancelled_reservations(self, start_date: str, end_date: str) -> List[Reservation]:
        return self._impl.cancelled_reservations(start_date, end_date)

    def get_inventory(
        self,
        start_date: str,
        end_date: str,
        provider_item_ids: Optional[List[str]] = None,
    ) -> List[Inventory]:
        return self._impl.get_inventory(start_date, end_date, provider_item_ids=provider_item_ids)


def normalize_mode(value: str) -> str:
    text = str(value or "").strip().lower()
    if text in ("wings", "wings_har", "har"):
        return "wings_har"
    return "api"
