from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List


RequestJsonFn = Callable[..., Any]


@dataclass(frozen=True)
class StationExecutor:
    base_url: str
    branch_id: str
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
        url = f"{self.base_url.rstrip('/')}/admin/branch/{self.branch_id}/apply/price-set"
        results: List[Dict[str, Any]] = []
        for action in actions:
            if not action.get("hasChange"):
                results.append({"date": action.get("date"), "status": "SKIPPED_NO_CHANGE"})
                continue
            request_json(
                session,
                "PATCH",
                url,
                headers=headers,
                timeout_sec=self.timeout_sec,
                payload=action["payload"],
            )
            results.append({"date": action.get("date"), "status": "APPLIED"})
            if self.sleep_ms > 0:
                time.sleep(self.sleep_ms / 1000.0)
        return results
