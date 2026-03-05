from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass(frozen=True)
class Reservation:
    reservation_id: str
    provider: str
    room_type: str
    checkin: str
    checkout: str
    nights: int
    status: str
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Inventory:
    provider_item_id: str
    date: str
    stock: int
    meta: Dict[str, Any] = field(default_factory=dict)
