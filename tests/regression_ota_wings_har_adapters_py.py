from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.ota.adapters import (  # noqa: E402
    AgodaAdapter,
    AgodaAdapterConfig,
    AirbnbAdapter,
    AirbnbAdapterConfig,
    BookingAdapter,
    BookingAdapterConfig,
    TripAdapter,
    TripAdapterConfig,
)


def build_har_payload() -> dict:
    rows = [
        {
            "RSVN_NO": "B-1001",
            "ARRV_DATE": "20260301",
            "DEPT_DATE": "20260303",
            "NIGHTS": "2",
            "SOURCE_CODE": "BOOKING",
            "ROOM_TYPE": "Deluxe",
            "RSVN_STATUS_CODE": "RR",
            "MOD_DTM": "2026-03-01T10:20:00",
        },
        {
            "RSVN_NO": "A-2001",
            "ARRV_DATE": "20260302",
            "DEPT_DATE": "20260304",
            "NIGHTS": "2",
            "SOURCE_CODE": "AGODA",
            "ROOM_TYPE": "Suite",
            "RSVN_STATUS_CODE": "CN",
            "MOD_DTM": "2026-03-02T11:20:00",
        },
        {
            "RSVN_NO": "T-3001",
            "ARRV_DATE": "20260303",
            "DEPT_DATE": "20260305",
            "NIGHTS": "2",
            "SOURCE_CODE": "TRIP",
            "ROOM_TYPE": "Urban",
            "RSVN_STATUS_CODE": "RR",
            "MOD_DTM": "2026-03-03T12:20:00",
        },
        {
            "confirmation_code": "ABNB-4001",
            "check_in": "2026-03-04",
            "check_out": "2026-03-06",
            "nights": 2,
            "channel": "AIRBNB",
            "status": "confirmed",
            "updated_at": "2026-03-04T13:20:00",
        },
        {
            "item_id": "BOOKING-ROOM-1",
            "date": "2026-03-01",
            "stock": 2,
            "SOURCE_CODE": "BOOKING",
        },
        {
            "item_id": "AGODA-ROOM-1",
            "date": "2026-03-02",
            "availability": 3,
            "SOURCE_CODE": "AGODA",
        },
        {
            "item_id": "TRIP-ROOM-1",
            "date": "2026-03-03",
            "availableStock": 1,
            "SOURCE_CODE": "TRIP",
        },
        {
            "listing_id": "AIRBNB-ROOM-1",
            "day": "2026-03-04",
            "stock": 1,
            "channel": "AIRBNB",
        },
    ]
    payload = {"data": {"rows": rows}}
    return {
        "log": {
            "entries": [
                {
                    "request": {"postData": {"text": json.dumps(payload, ensure_ascii=False)}},
                    "response": {"content": {"text": json.dumps(payload, ensure_ascii=False)}},
                }
            ]
        }
    }


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        har_path = Path(tmp) / "wings_sample.har"
        har_path.write_text(json.dumps(build_har_payload(), ensure_ascii=False), encoding="utf-8")
        har_list = [str(har_path)]
        session = requests.Session()

        booking = BookingAdapter(session, BookingAdapterConfig(wings_har_paths=har_list))
        booking_res = booking.fetch_reservations("2026-03-01", "2026-03-31")
        assert len(booking_res) == 1
        assert booking_res[0].provider == "BOOKING"
        assert booking_res[0].reservation_id == "B-1001"
        booking_changes = booking.fetch_changes("2026-03-01T00:00:00")
        assert booking_changes
        booking_inv = booking.get_inventory("2026-03-01", "2026-03-01", provider_item_ids=["BOOKING-ROOM-1"])
        assert booking_inv and booking_inv[0].stock == 2

        agoda = AgodaAdapter(session, AgodaAdapterConfig(wings_har_paths=har_list))
        agoda_res = agoda.fetch_reservations("2026-03-01", "2026-03-31")
        assert len(agoda_res) == 1
        assert agoda_res[0].provider == "AGODA"
        agoda_canceled = agoda.cancelled_reservations("2026-03-01", "2026-03-31")
        assert len(agoda_canceled) == 1
        assert agoda_canceled[0].status == "CANCELED"
        agoda_inv = agoda.get_inventory("2026-03-02", "2026-03-02", provider_item_ids=["AGODA-ROOM-1"])
        assert agoda_inv and agoda_inv[0].stock == 3

        trip = TripAdapter(session, TripAdapterConfig(wings_har_paths=har_list))
        trip_res = trip.fetch_reservations("2026-03-01", "2026-03-31")
        assert len(trip_res) == 1
        assert trip_res[0].reservation_id == "T-3001"
        trip_inv = trip.get_inventory("2026-03-03", "2026-03-03", provider_item_ids=["TRIP-ROOM-1"])
        assert trip_inv and trip_inv[0].stock == 1

        airbnb = AirbnbAdapter(session, AirbnbAdapterConfig(wings_har_paths=har_list))
        airbnb_res = airbnb.fetch_reservations("2026-03-01", "2026-03-31")
        assert len(airbnb_res) == 1
        assert airbnb_res[0].reservation_id == "ABNB-4001"
        airbnb_inv = airbnb.get_inventory("2026-03-04", "2026-03-04", provider_item_ids=["AIRBNB-ROOM-1"])
        assert airbnb_inv and airbnb_inv[0].stock == 1

    print("regression_ota_wings_har_adapters_py: OK")


if __name__ == "__main__":
    main()
