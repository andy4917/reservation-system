from __future__ import annotations

from typing import Any, Dict, List


def _safe_int(value: Any) -> int:
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


def _normalize_provider(value: Any) -> str:
    text = str(value or "").strip().upper()
    return text or "UNKNOWN"


def _active_count_from_ota(provider_row: Dict[str, Any]) -> int:
    if not isinstance(provider_row, dict):
        return 0
    if "active_count" in provider_row:
        return max(_safe_int(provider_row.get("active_count")), 0)
    reservation_count = _safe_int(provider_row.get("reservation_count"))
    canceled_count = _safe_int(provider_row.get("canceled_count"))
    return max(reservation_count - canceled_count, 0)


def _active_count_from_pms(provider_row: Dict[str, Any]) -> int:
    if not isinstance(provider_row, dict):
        return 0
    if "active_count" in provider_row:
        return max(_safe_int(provider_row.get("active_count")), 0)
    reservation_count = _safe_int(provider_row.get("reservation_count"))
    canceled_count = _safe_int(provider_row.get("canceled_count"))
    return max(reservation_count - canceled_count, 0)


def build_ota_pms_anomaly_report(
    *,
    ota_sources: Dict[str, Any],
    pms_sources: Dict[str, Any],
    warn_threshold: int = 1,
    error_threshold: int = 2,
) -> Dict[str, Any]:
    ota_enabled = bool((ota_sources or {}).get("enabled")) if isinstance(ota_sources, dict) else False
    pms_enabled = bool((pms_sources or {}).get("enabled")) if isinstance(pms_sources, dict) else False
    if not ota_enabled or not pms_enabled:
        reasons: List[str] = []
        if not ota_enabled:
            reasons.append("OTA source summary disabled")
        if not pms_enabled:
            reasons.append("PMS source summary disabled")
        return {
            "version": "v1",
            "enabled": False,
            "role": "audit_engine",
            "source_policy": "PMS anomaly detection (not planner truth source)",
            "reason": ", ".join(reasons),
            "rows": [],
            "anomalies": [],
            "counts": {
                "providers": 0,
                "mismatches": 0,
                "anomalies": 0,
                "warn": 0,
                "error": 0,
            },
        }

    ota_providers = (ota_sources or {}).get("providers", {}) if isinstance(ota_sources, dict) else {}
    pms_providers = (pms_sources or {}).get("providers", {}) if isinstance(pms_sources, dict) else {}
    keys = sorted({_normalize_provider(key) for key in list(ota_providers.keys()) + list(pms_providers.keys())})

    rows: List[Dict[str, Any]] = []
    anomalies: List[Dict[str, Any]] = []
    for provider in keys:
        ota_row = ota_providers.get(provider, {})
        pms_row = pms_providers.get(provider, {})
        ota_active = _active_count_from_ota(ota_row)
        pms_active = _active_count_from_pms(pms_row)
        delta = ota_active - pms_active
        abs_delta = abs(delta)
        status = "MATCH" if abs_delta == 0 else "MISMATCH"

        rows.append(
            {
                "provider": provider,
                "ota_active": ota_active,
                "pms_active": pms_active,
                "delta": delta,
                "status": status,
            }
        )

        if abs_delta <= 0:
            continue
        if abs_delta >= error_threshold:
            severity = "error"
        elif abs_delta >= warn_threshold:
            severity = "warn"
        else:
            severity = "info"
        anomalies.append(
            {
                "provider": provider,
                "code": "OTA_PMS_RESERVATION_GAP",
                "severity": severity,
                "ota_active": ota_active,
                "pms_active": pms_active,
                "delta": delta,
                "message": (
                    f"{provider} reservation gap detected "
                    f"(ota_active={ota_active}, pms_active={pms_active}, delta={delta})."
                ),
            }
        )

    return {
        "version": "v1",
        "enabled": True,
        "role": "audit_engine",
        "source_policy": "PMS anomaly detection (not planner truth source)",
        "rows": rows,
        "anomalies": anomalies,
        "counts": {
            "providers": len(rows),
            "mismatches": sum(1 for row in rows if row.get("status") == "MISMATCH"),
            "anomalies": len(anomalies),
            "warn": sum(1 for row in anomalies if row.get("severity") == "warn"),
            "error": sum(1 for row in anomalies if row.get("severity") == "error"),
        },
    }
