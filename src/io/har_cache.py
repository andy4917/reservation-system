from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List


@lru_cache(maxsize=32)
def _load_har_payload_cached(path_text: str) -> Any:
    path = Path(path_text)
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def reset_har_cache() -> None:
    _load_har_payload_cached.cache_clear()


def load_har_payload(path: Path | str) -> Any:
    return _load_har_payload_cached(str(Path(path).resolve()))


def load_har_entries(path: Path | str) -> List[Dict[str, Any]]:
    payload = load_har_payload(path)
    entries = payload.get("log", {}).get("entries", []) if isinstance(payload, dict) else []
    if not isinstance(entries, list):
        return []
    return [entry for entry in entries if isinstance(entry, dict)]
