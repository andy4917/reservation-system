from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List

from src.core_bridge.drift_bridge import build_provider_plan as bridge_build_provider_plan


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


def _normalize_provider_key(value: Any) -> str:
    text = str(value or "").strip().upper()
    if not text:
        return "UNKNOWN"
    return text


def build_source_graph() -> Dict[str, Any]:
    return {
        "version": "v1",
        "sources": {
            "OTA": {
                "role": "authoritative",
                "description": "Expected inventory truth source.",
            },
            "PMS": {
                "role": "audit",
                "description": "Operational reservation/room-state anomaly detection source.",
            },
            "SHEET": {
                "role": "ui",
                "description": "UI/ops input surface, not authoritative truth source.",
            },
        },
        "flow": [
            {"from": "OTA", "to": "InventoryPlanner", "kind": "expected_input"},
            {"from": "PMS", "to": "AuditEngine", "kind": "anomaly_detection_input"},
            {"from": "SHEET", "to": "InventoryPlanner", "kind": "ui_input"},
            {"from": "AuditEngine", "to": "ValidationEngine", "kind": "audit_signal"},
            {"from": "InventoryPlanner", "to": "SyncPlanner", "kind": "planned_actions"},
            {"from": "SyncPlanner", "to": "ChannelExecutors", "kind": "apply_payload"},
        ],
    }


def build_inventory_authority_policy() -> Dict[str, Any]:
    return {
        "version": "v1",
        "ota_authority": "authoritative",
        "pms_role": "audit",
        "sheet_role": "ui",
        "rule": "OTA authoritative / PMS audit / Sheet UI",
    }


def _build_provider_plan_py(provider_key: str, reconciliation: Dict[str, Any]) -> Dict[str, Any]:
    rows = reconciliation.get("rows", []) if isinstance(reconciliation, dict) else []
    actions: List[Dict[str, Any]] = []
    drift_dates = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        day = str(row.get("date") or "").strip()
        desired_units = _safe_int(row.get("desired_units"))
        actual_units = _safe_int(row.get("actual_units"))
        drift_units = _safe_int(row.get("drift_units"))
        if not day:
            continue
        if drift_units == 0:
            continue
        drift_dates += 1
        actions.append(
            {
                "date": day,
                "desired_units": desired_units,
                "actual_units": actual_units,
                "drift_units": drift_units,
                "action": "increase" if drift_units > 0 else "decrease",
            }
        )
    return {
        "provider": _normalize_provider_key(provider_key),
        "drift_dates": drift_dates,
        "planned_action_count": len(actions),
        "actions": actions,
    }


def _build_provider_plan(provider_key: str, reconciliation: Dict[str, Any]) -> Dict[str, Any]:
    return bridge_build_provider_plan(
        provider_key,
        reconciliation,
        fallback=_build_provider_plan_py,
    )


def _compute_plan_token(payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _collect_apply_action_scope(summary: Dict[str, Any]) -> Dict[str, Any]:
    station_actions_raw = (summary.get("station") or {}).get("actions", []) if isinstance(summary, dict) else []
    naver_actions_raw = (summary.get("naver") or {}).get("actions", []) if isinstance(summary, dict) else []

    station_actions: List[Dict[str, Any]] = []
    for row in station_actions_raw if isinstance(station_actions_raw, list) else []:
        if not isinstance(row, dict):
            continue
        station_actions.append(
            {
                "date": str(row.get("date") or "").strip(),
                "hasChange": bool(row.get("hasChange")),
                "mismatchCount": _safe_int(row.get("mismatchCount")),
                "payload": row.get("payload") if isinstance(row.get("payload"), dict) else {},
            }
        )

    naver_actions: List[Dict[str, Any]] = []
    for row in naver_actions_raw if isinstance(naver_actions_raw, list) else []:
        if not isinstance(row, dict):
            continue
        naver_actions.append(
            {
                "date": str(row.get("date") or "").strip(),
                "type": str(row.get("type") or "").strip(),
                "bizItemId": str(row.get("bizItemId") or "").strip(),
                "payload": row.get("payload") if isinstance(row.get("payload"), dict) else {},
            }
        )

    station_actions = sorted(
        station_actions,
        key=lambda row: (
            str(row.get("date") or ""),
            1 if bool(row.get("hasChange")) else 0,
            str(json.dumps(row.get("payload") or {}, ensure_ascii=False, sort_keys=True)),
        ),
    )
    naver_actions = sorted(
        naver_actions,
        key=lambda row: (
            str(row.get("date") or ""),
            str(row.get("type") or ""),
            str(row.get("bizItemId") or ""),
            str(json.dumps(row.get("payload") or {}, ensure_ascii=False, sort_keys=True)),
        ),
    )

    station_effective_count = sum(1 for row in station_actions if bool(row.get("hasChange")))

    return {
        "station": {
            "count": station_effective_count,
            "candidate_count": len(station_actions),
            "actions": station_actions,
        },
        "naver": {
            "count": len(naver_actions),
            "candidate_count": len(naver_actions),
            "actions": naver_actions,
        },
    }


def build_inventory_planner_summary(
    summary: Dict[str, Any],
    *,
    requested_apply: bool,
    approve_plan_token: str = "",
) -> Dict[str, Any]:
    reconciliation = summary.get("reconciliation", {}) if isinstance(summary, dict) else {}
    providers_raw = reconciliation.get("providers", {}) if isinstance(reconciliation, dict) else {}
    validation = summary.get("validation", {}) if isinstance(summary, dict) else {}
    policy = summary.get("policy", {}) if isinstance(summary, dict) else {}

    provider_plans: Dict[str, Any] = {}
    total_actions = 0
    for provider_key in ("station", "naver"):
        provider_recon = providers_raw.get(provider_key, {})
        plan = _build_provider_plan(provider_key, provider_recon)
        provider_plans[provider_key] = plan
        total_actions += _safe_int(plan.get("planned_action_count"))

    validation_errors = 0
    validation_warnings = 0
    for provider_key in ("station", "naver"):
        provider_validation = validation.get(provider_key, {})
        validation_errors += _safe_int(provider_validation.get("errorCount"))
        validation_warnings += _safe_int(provider_validation.get("warnCount"))

    apply_action_scope = _collect_apply_action_scope(summary)
    approval_payload = {
        "providers": provider_plans,
        "validation_errors": validation_errors,
        "validation_warnings": validation_warnings,
        "policy_blocked": bool(policy.get("blocked")),
        "apply_action_scope": apply_action_scope,
    }
    required_token = _compute_plan_token(approval_payload) if total_actions > 0 else ""
    approved = (not requested_apply) or (not required_token) or (approve_plan_token == required_token)

    return {
        "version": "v1",
        "source_graph": build_source_graph(),
        "inventory_authority": build_inventory_authority_policy(),
        "stages": {
            "diff": {
                "completed": True,
                "planned_action_count": total_actions,
            },
            "validate": {
                "completed": True,
                "error_count": validation_errors,
                "warning_count": validation_warnings,
                "blocked": bool(policy.get("blocked")),
            },
            "approve": {
                "required": bool(requested_apply and total_actions > 0),
                "required_token": required_token,
                "provided_token": str(approve_plan_token or "").strip(),
                "approved": bool(approved),
                "token_scope": "provider_drift+validation+policy+apply_action_scope",
            },
            "apply": {
                "requested": bool(requested_apply),
                "allowed": bool(
                    (not requested_apply)
                    or (approved and not bool(policy.get("blocked")))
                ),
            },
        },
        "providers": provider_plans,
        "apply_action_scope": apply_action_scope,
        "totals": {
            "providers": len(provider_plans),
            "planned_actions": total_actions,
        },
    }
