#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


PRIORITY_CAPABILITIES = [
    "reservation_lookup",
    "reservation_lookup_local",
    "reservation_detail",
    "reservation_summary",
    "linked_reservation_lookup",
    "room_block_chart",
    "room_availability_chart",
    "room_availability_summary",
    "source_catalog",
    "nationality_language_lookup",
    "assigned_room_guest_info",
    "assigned_room_lookup",
    "assignable_room_lookup",
    "assignable_room_type_lookup",
]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def build_matrix(endpoint_report: Dict[str, Any], branch_mapping: Dict[str, Any]) -> Dict[str, Any]:
    branch_rows = branch_mapping.get("branches", []) if isinstance(branch_mapping, dict) else []
    branches = {
        str(item.get("branch")): item
        for item in branch_rows
        if isinstance(item, dict) and str(item.get("branch") or "").strip()
    }
    by_capability: Dict[str, Dict[str, Any]] = {}
    for endpoint in endpoint_report.get("endpoints", []):
        if not isinstance(endpoint, dict):
            continue
        capability = str(endpoint.get("capability") or "").strip()
        if not capability or capability.endswith("unknown"):
            continue
        row = by_capability.setdefault(
            capability,
            {
                "capability": capability,
                "group": str(endpoint.get("group") or "").strip(),
                "read_only": bool(endpoint.get("read_only")),
                "paths": [],
                "branches": set(),
                "request_keys": set(),
                "response_row_keys": set(),
                "response_top_level_keys": set(),
            },
        )
        row["paths"].append(str(endpoint.get("path") or "").strip())
        row["branches"].update(endpoint.get("branches") or [])
        row["request_keys"].update(endpoint.get("request_keys") or [])
        row["response_row_keys"].update(endpoint.get("response_row_keys") or [])
        row["response_top_level_keys"].update(endpoint.get("response_top_level_keys") or [])

    capabilities: List[Dict[str, Any]] = []
    ordered_names = [name for name in PRIORITY_CAPABILITIES if name in by_capability] + sorted(
        [name for name in by_capability.keys() if name not in PRIORITY_CAPABILITIES]
    )
    for name in ordered_names:
        row = by_capability[name]
        branch_status = []
        for branch in sorted(row["branches"]):
            branch_map = branches.get(branch, {})
            branch_status.append(
                {
                    "branch": branch,
                    "display_name": str(branch_map.get("display_name") or branch),
                    "observed_in_har": True,
                }
            )
        capabilities.append(
            {
                "capability": name,
                "group": row["group"],
                "read_only": row["read_only"],
                "paths": sorted(set(path for path in row["paths"] if path)),
                "branches": branch_status,
                "request_keys": sorted(row["request_keys"]),
                "response_top_level_keys": sorted(row["response_top_level_keys"]),
                "response_row_keys": sorted(row["response_row_keys"]),
            }
        )

    return {
        "matrix_version": "wings-capability-matrix-v1",
        "source": {
            "endpoint_report": "truth_dataset/reports/wings_har_endpoint_catalog.json",
            "branch_mapping": "truth_dataset/branch_provider_mapping_v1.json",
        },
        "capability_count": len(capabilities),
        "capabilities": capabilities,
        "unknown_endpoint_count": sum(
            1
            for endpoint in endpoint_report.get("endpoints", [])
            if str(endpoint.get("capability") or "").endswith("unknown")
        ),
        "notes": [
            "Capabilities are generated from latest official COEX/GANGNAM HAR captures and exclude endpoints still classified as unknown.",
            "Legacy reservation-list HAR alias is intentionally excluded from default capability paths.",
            "This matrix is the input surface for phase-2 channel-aware live contracts and provider capability gating.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Wings capability matrix from sanitized HAR endpoint report.")
    parser.add_argument(
        "--endpoint-report",
        default="truth_dataset/reports/wings_har_endpoint_catalog.json",
        help="Path to sanitized endpoint report JSON",
    )
    parser.add_argument(
        "--branch-mapping",
        default="truth_dataset/branch_provider_mapping_v1.json",
        help="Path to branch/provider mapping JSON",
    )
    parser.add_argument(
        "--output",
        default="truth_dataset/wings_capability_matrix_v1.json",
        help="Output path",
    )
    args = parser.parse_args()

    endpoint_report = load_json(Path(args.endpoint_report).resolve())
    branch_mapping = load_json(Path(args.branch_mapping).resolve())
    matrix = build_matrix(endpoint_report, branch_mapping)
    out_path = Path(args.output).resolve()
    out_path.write_text(json.dumps(matrix, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
