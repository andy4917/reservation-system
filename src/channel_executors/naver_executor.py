from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List


RequestJsonFn = Callable[..., Any]


@dataclass(frozen=True)
class NaverExecutor:
    base_url: str
    business_id: str
    timeout_sec: int = 20
    sleep_ms: int = 0

    def apply_inventory_actions(
        self,
        *,
        session: Any,
        headers: Dict[str, str],
        actions: List[Dict[str, Any]],
        request_json: RequestJsonFn,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        for action in actions:
            room_id = action["bizItemId"]
            if action["type"] == "stock":
                url = (
                    f"{self.base_url.rstrip('/')}/v3.0/businesses/{self.business_id}"
                    f"/biz-items/{room_id}/stock-schedules"
                )
            else:
                url = (
                    f"{self.base_url.rstrip('/')}/v3.1/businesses/{self.business_id}"
                    f"/biz-items/{room_id}/sale-schedules"
                )

            request_json(
                session,
                "POST",
                url,
                headers=headers,
                timeout_sec=self.timeout_sec,
                payload=action["payload"],
            )
            results.append(
                {
                    "type": action["type"],
                    "bizItemId": room_id,
                    "date": action["date"],
                    "status": "APPLIED",
                }
            )
            if self.sleep_ms > 0:
                time.sleep(self.sleep_ms / 1000.0)
        return results
