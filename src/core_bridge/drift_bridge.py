from __future__ import annotations

from typing import Any, Dict

from src.core_bridge.runtime import load_cpp_module


def build_provider_plan(
    provider_key: str,
    reconciliation: Dict[str, Any],
) -> Dict[str, Any]:
    core = load_cpp_module()
    result = core.drift_compute(
        {
            "provider_key": provider_key,
            "reconciliation": reconciliation,
        }
    )
    return dict(result) if isinstance(result, dict) else {}
