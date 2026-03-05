from __future__ import annotations

import abc
from typing import List, Optional

from src.ota.models import Inventory, Reservation


class OTAAdapterError(RuntimeError):
    pass


class OTAAdapter(abc.ABC):
    provider: str = ""

    @abc.abstractmethod
    def fetch_reservations(self, start_date: str, end_date: str) -> List[Reservation]:
        raise NotImplementedError

    @abc.abstractmethod
    def fetch_changes(self, since: str) -> List[Reservation]:
        raise NotImplementedError

    @abc.abstractmethod
    def cancelled_reservations(self, start_date: str, end_date: str) -> List[Reservation]:
        raise NotImplementedError

    @abc.abstractmethod
    def get_inventory(
        self,
        start_date: str,
        end_date: str,
        provider_item_ids: Optional[List[str]] = None,
    ) -> List[Inventory]:
        raise NotImplementedError
