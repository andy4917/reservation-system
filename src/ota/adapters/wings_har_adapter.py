from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from src.domain.sheet_domain import normalize_platform_name, normalize_text
from src.io.har_cache import load_har_entries
from src.ota.base import OTAAdapter, OTAAdapterError
from src.ota.models import Inventory, Reservation


RESERVATION_ID_KEYS = (
    "reservation_no",
    "reservationNo",
    "rsvn_no",
    "RSVN_NO",
    "booking_id",
    "bookingId",
    "reservation_id",
    "reservationId",
    "id",
    "confirmation_code",
    "confirmationCode",
)

CHECKIN_KEYS = (
    "checkin",
    "checkIn",
    "check_in",
    "arrv_date",
    "ARRV_DATE",
    "arrivalDate",
    "arrival_date",
    "startDate",
)

CHECKOUT_KEYS = (
    "checkout",
    "checkOut",
    "check_out",
    "dept_date",
    "DEPT_DATE",
    "departureDate",
    "departure_date",
    "endDate",
)

NIGHTS_KEYS = ("nights", "night", "stay_nights", "lengthOfStay")
STATUS_KEYS = ("status", "reservation_status", "booking_status", "RSVN_STATUS_CODE", "rsvn_status_code")
CHANNEL_KEYS = ("channel", "ota", "platform", "source_code", "SOURCE_CODE", "account", "ACCOUNT")
ROOM_TYPE_KEYS = ("room_type", "roomType", "room_name", "roomName", "room_type_name")
UPDATED_AT_KEYS = ("updated_at", "updatedAt", "lastModified", "last_modified", "MOD_DTM")

INVENTORY_ITEM_KEYS = ("provider_item_id", "providerItemId", "room_id", "roomId", "listing_id", "listingId", "item_id")
INVENTORY_DATE_KEYS = ("date", "day", "biz_date", "stayDate", "targetDate")
INVENTORY_STOCK_KEYS = ("stock", "availableStock", "available", "availability", "remaining")


@dataclass(frozen=True)
class WingsHarAdapterConfig:
    provider: str
    har_paths: List[str] = field(default_factory=list)


def _try_parse_json_text(text: str) -> Optional[Any]:
    raw = str(text or "").strip()
    if not raw:
        return None
    candidates = [raw]
    if raw.startswith(")]}'"):
        candidates.append(raw[4:].lstrip())
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except Exception:  # noqa: BLE001
            continue
    return None


def _iter_json_objects(value: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from _iter_json_objects(item)
    elif isinstance(value, list):
        for item in value:
            yield from _iter_json_objects(item)


def _to_int(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    text = str(value or "").strip()
    if not text:
        return 0
    try:
        return int(float(text))
    except Exception:  # noqa: BLE001
        return 0


def _first_text(row: Dict[str, Any], keys: Sequence[str]) -> str:
    for key in keys:
        value = row.get(key)
        if value is None:
            continue
        text = normalize_text(str(value))
        if text:
            return text
    return ""


def _parse_date(value: Any) -> Optional[date]:
    if isinstance(value, date):
        return value
    text = normalize_text(str(value or ""))
    if not text:
        return None
    if len(text) >= 10:
        try:
            return date.fromisoformat(text[:10])
        except Exception:  # noqa: BLE001
            pass
    compact = "".join(ch for ch in text if ch.isdigit())
    if len(compact) >= 8:
        candidate = f"{compact[:4]}-{compact[4:6]}-{compact[6:8]}"
        try:
            return date.fromisoformat(candidate)
        except Exception:  # noqa: BLE001
            return None
    return None


def _parse_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    text = normalize_text(str(value or ""))
    if not text:
        return None
    iso_candidate = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(iso_candidate)
        return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
    except Exception:  # noqa: BLE001
        pass
    day = _parse_date(text)
    if day:
        return datetime(day.year, day.month, day.day)
    return None


def _normalize_status(value: Any) -> str:
    text = normalize_text(str(value or "")).upper()
    if not text:
        return "UNKNOWN"
    canceled_tokens = ("CANCEL", "VOID", "REFUND", "CXL", "CNCL", "CANC", "CX", "CN")
    if text == "CANCELED" or any(token in text for token in canceled_tokens):
        return "CANCELED"
    if text in ("RR", "CONFIRMED", "BOOKED", "ACTIVE", "OK"):
        return "CONFIRMED"
    return text


class WingsHarAdapter(OTAAdapter):
    def __init__(self, config: WingsHarAdapterConfig) -> None:
        self.provider = normalize_text(config.provider).upper()
        self._har_paths = [str(path).strip() for path in (config.har_paths or []) if str(path).strip()]

    def fetch_reservations(self, start_date: str, end_date: str) -> List[Reservation]:
        start = self._parse_required_date(start_date, "start_date")
        end = self._parse_required_date(end_date, "end_date")
        rows = self._load_reservations()
        return [row for row in rows if self._in_date_range(row, start, end)]

    def fetch_changes(self, since: str) -> List[Reservation]:
        since_dt = self._parse_required_datetime(since, "since")
        rows = self._load_reservations()
        out: List[Reservation] = []
        for row in rows:
            updated = row.meta.get("updated_at") if isinstance(row.meta, dict) else None
            updated_dt = _parse_datetime(updated)
            if updated_dt and updated_dt >= since_dt:
                out.append(row)
                continue
            checkin = _parse_date(row.checkin)
            if checkin and datetime(checkin.year, checkin.month, checkin.day) >= since_dt:
                out.append(row)
        return out

    def cancelled_reservations(self, start_date: str, end_date: str) -> List[Reservation]:
        start = self._parse_required_date(start_date, "start_date")
        end = self._parse_required_date(end_date, "end_date")
        rows = self._load_reservations()
        return [row for row in rows if row.status == "CANCELED" and self._in_date_range(row, start, end)]

    def get_inventory(
        self,
        start_date: str,
        end_date: str,
        provider_item_ids: Optional[List[str]] = None,
    ) -> List[Inventory]:
        start = self._parse_required_date(start_date, "start_date")
        end = self._parse_required_date(end_date, "end_date")
        item_id_filter = {normalize_text(str(item)).upper() for item in (provider_item_ids or []) if str(item).strip()}

        out: List[Inventory] = []
        for path in self._har_paths:
            payloads = self._load_payloads(Path(path))
            for payload in payloads:
                for row in _iter_json_objects(payload):
                    provider = self._detect_provider(row)
                    if provider and provider != self.provider:
                        continue
                    item_id = _first_text(row, INVENTORY_ITEM_KEYS)
                    day = _parse_date(_first_text(row, INVENTORY_DATE_KEYS))
                    if not item_id or not day:
                        continue
                    if item_id_filter and normalize_text(item_id).upper() not in item_id_filter:
                        continue
                    if day < start or day > end:
                        continue
                    stock_value = _first_text(row, INVENTORY_STOCK_KEYS)
                    if not stock_value:
                        continue
                    out.append(
                        Inventory(
                            provider_item_id=item_id,
                            date=day.isoformat(),
                            stock=max(_to_int(stock_value), 0),
                            meta={"provider": self.provider, "source": path},
                        )
                    )
        deduped: Dict[Tuple[str, str], Inventory] = {}
        for row in out:
            deduped[(row.provider_item_id, row.date)] = row
        return [deduped[key] for key in sorted(deduped.keys())]

    def _load_reservations(self) -> List[Reservation]:
        out: List[Reservation] = []
        for path in self._har_paths:
            payloads = self._load_payloads(Path(path))
            for payload in payloads:
                for row in _iter_json_objects(payload):
                    reservation_id = _first_text(row, RESERVATION_ID_KEYS)
                    checkin = _parse_date(_first_text(row, CHECKIN_KEYS))
                    checkout = _parse_date(_first_text(row, CHECKOUT_KEYS))
                    nights = _to_int(_first_text(row, NIGHTS_KEYS))
                    if checkin and checkout and nights <= 0:
                        nights = max((checkout - checkin).days, 0)
                    if checkin and not checkout and nights > 0:
                        checkout = checkin + timedelta(days=nights)
                    if not reservation_id or not checkin or not checkout:
                        continue
                    provider = self._detect_provider(row)
                    if provider and provider != self.provider:
                        continue
                    status = _normalize_status(_first_text(row, STATUS_KEYS))
                    room_type = _first_text(row, ROOM_TYPE_KEYS)
                    updated_at = _first_text(row, UPDATED_AT_KEYS)
                    out.append(
                        Reservation(
                            reservation_id=reservation_id,
                            provider=self.provider,
                            room_type=room_type,
                            checkin=checkin.isoformat(),
                            checkout=checkout.isoformat(),
                            nights=max(nights, 0),
                            status=status,
                            meta={
                                "provider": self.provider,
                                "source": path,
                                "updated_at": updated_at,
                            },
                        )
                    )
        deduped: Dict[Tuple[str, str, str], Reservation] = {}
        for row in out:
            deduped[(row.reservation_id, row.checkin, row.checkout)] = row
        return [deduped[key] for key in sorted(deduped.keys())]

    def _load_payloads(self, har_path: Path) -> List[Any]:
        if not har_path.exists():
            raise OTAAdapterError(f"HAR file not found: {har_path}")
        try:
            entries = load_har_entries(har_path)
        except Exception as exc:  # noqa: BLE001
            raise OTAAdapterError(f"Failed to read HAR: {har_path}") from exc

        out: List[Any] = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            req_text = ((entry.get("request") or {}).get("postData") or {}).get("text", "")
            res_text = ((entry.get("response") or {}).get("content") or {}).get("text", "")
            for text in (req_text, res_text):
                parsed = _try_parse_json_text(str(text or ""))
                if parsed is not None:
                    out.append(parsed)
        return out

    def _detect_provider(self, row: Dict[str, Any]) -> str:
        raw = _first_text(row, CHANNEL_KEYS)
        normalized = normalize_platform_name(raw).upper()
        if normalized:
            return normalized
        return ""

    def _parse_required_date(self, value: str, field_name: str) -> date:
        parsed = _parse_date(value)
        if not parsed:
            raise OTAAdapterError(f"Invalid {field_name}: {value}")
        return parsed

    def _parse_required_datetime(self, value: str, field_name: str) -> datetime:
        parsed = _parse_datetime(value)
        if not parsed:
            raise OTAAdapterError(f"Invalid {field_name}: {value}")
        return parsed

    def _in_date_range(self, row: Reservation, start: date, end: date) -> bool:
        checkin = _parse_date(row.checkin)
        checkout = _parse_date(row.checkout)
        if not checkin or not checkout:
            return False
        return not (checkout < start or checkin > end)
