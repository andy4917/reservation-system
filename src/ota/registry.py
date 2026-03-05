from __future__ import annotations

from typing import Dict, Type

from src.ota.base import OTAAdapter
from src.ota.adapters import AgodaAdapter, AirbnbAdapter, BookingAdapter, TripAdapter


OTA_ADAPTER_TYPES: Dict[str, Type[OTAAdapter]] = {
    "booking": BookingAdapter,
    "agoda": AgodaAdapter,
    "trip": TripAdapter,
    "airbnb": AirbnbAdapter,
}


def list_ota_adapters() -> Dict[str, str]:
    return {name: adapter.provider for name, adapter in OTA_ADAPTER_TYPES.items()}
