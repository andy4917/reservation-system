from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_TOP_LEVEL = {
    "sheet_rows": ["branch", "room_row", "inventory_row", "date", "raw_channel", "canonical_channel", "room_aliases"],
    "wings_reservations": [
        "branch",
        "reservation_no",
        "room_no",
        "status",
        "status_bucket",
        "raw_channel",
        "canonical_channel",
        "updated_at",
    ],
    "ota_inventory_rows": ["provider", "branch", "item_id", "date", "stock", "raw_room_label", "raw_channel"],
    "ota_reservations": ["provider", "branch", "reservation_id", "raw_status", "raw_room_label", "raw_channel"],
    "bridge_events": ["provider", "branch", "rawLine", "sourceLineIndex", "candidateBasis", "signals", "tags"],
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def count_missing_fields(rows: list[dict[str, Any]], required_fields: list[str]) -> int:
    missing = 0
    for row in rows:
        for field in required_fields:
            value = row.get(field)
            if value is None or value == "" or value == []:
                missing += 1
    return missing


def compute_join_coverage(bundle: dict[str, Any]) -> dict[str, Any]:
    entities = bundle["entities"]
    systems_by_reservation: dict[str, set[str]] = defaultdict(set)
    systems_by_room: dict[str, set[str]] = defaultdict(set)

    for row in entities["wings_reservations"]:
        systems_by_reservation[str(row.get("canonical_reservation_id") or row.get("reservation_no") or "")].add("WINGS")
        systems_by_room[str(row.get("canonical_room_id") or row.get("room_no") or "")].add("WINGS")
    for row in entities["ota_reservations"]:
        systems_by_reservation[str(row.get("canonical_reservation_id") or row.get("reservation_id") or "")].add("OTA")
    for row in entities["sheet_rows"]:
        systems_by_room[str(row.get("canonical_room_id") or "")].add("SHEET")

    reservation_joined = sum(1 for systems in systems_by_reservation.values() if {"WINGS", "OTA"}.issubset(systems))
    room_joined = sum(1 for systems in systems_by_room.values() if {"WINGS", "SHEET"}.issubset(systems))

    return {
        "reservation_keys": len([key for key in systems_by_reservation if key]),
        "reservation_joined": reservation_joined,
        "room_keys": len([key for key in systems_by_room if key]),
        "room_joined": room_joined,
    }


def compute_channel_accuracy(bundle: dict[str, Any]) -> dict[str, Any]:
    rows = bundle["entities"]["wings_reservations"] + bundle["entities"]["ota_inventory_rows"] + bundle["entities"]["ota_reservations"]
    known = 0
    mapped = 0
    for row in rows:
        raw_channel = str(row.get("raw_channel") or "").strip()
        canonical_channel = str(row.get("canonical_channel") or "").strip()
        if raw_channel:
            known += 1
            if canonical_channel and canonical_channel != "UNKNOWN":
                mapped += 1
    return {"known": known, "mapped": mapped}


def compute_room_alias_unresolved(bundle: dict[str, Any], room_alias_graph: dict[str, Any]) -> dict[str, Any]:
    known_aliases = set()
    for node in room_alias_graph.get("nodes", []):
        known_aliases.add(str(node.get("canonical_room_id") or ""))
        for alias in node.get("derived_aliases", []):
            known_aliases.add(str(alias))
        for alias_row in node.get("aliases", []):
            known_aliases.add(str(alias_row.get("raw_value") or ""))

    unresolved = 0
    total = 0
    for row in bundle["entities"]["sheet_rows"]:
        for alias in row.get("room_aliases", []):
            total += 1
            if str(alias) not in known_aliases:
                unresolved += 1
    return {"total": total, "unresolved": unresolved}


def compute_identity_collision(bundle: dict[str, Any]) -> dict[str, Any]:
    canonical_ids = Counter()
    for row in bundle["entities"]["wings_reservations"]:
        key = str(row.get("canonical_reservation_id") or "")
        if key:
            canonical_ids[key] += 1
    for row in bundle["entities"]["ota_reservations"]:
        key = str(row.get("canonical_reservation_id") or "")
        if key:
            canonical_ids[key] += 1
    collisions = sum(1 for _, count in canonical_ids.items() if count > 2)
    return {"keys": len(canonical_ids), "collisions": collisions}


def compute_branch_missing_rate(bundle: dict[str, Any]) -> dict[str, Any]:
    by_branch: dict[str, dict[str, int]] = defaultdict(lambda: {"rows": 0, "missing": 0})
    for group_name, fields in REQUIRED_TOP_LEVEL.items():
        for row in bundle["entities"][group_name]:
            branch = str(row.get("branch") or "UNKNOWN")
            by_branch[branch]["rows"] += 1
            for field in fields:
                value = row.get(field)
                if value is None or value == "" or value == []:
                    by_branch[branch]["missing"] += 1
    return by_branch


def validate_bundle(bundle: dict[str, Any], room_alias_graph: dict[str, Any]) -> dict[str, Any]:
    manifest = bundle.get("manifest", {})
    entities = bundle.get("entities", {})
    failures: list[str] = []
    if bundle.get("contract_version") != "canonical-data-contract-v1":
        failures.append("contract_version mismatch")
    if not manifest.get("bundle_id"):
        failures.append("manifest.bundle_id missing")
    for group_name, required_fields in REQUIRED_TOP_LEVEL.items():
        rows = entities.get(group_name)
        if not isinstance(rows, list) or not rows:
            failures.append(f"{group_name} missing or empty")
            continue
        missing_count = count_missing_fields(rows, required_fields)
        if missing_count:
            failures.append(f"{group_name} missing required field count={missing_count}")

    metrics = {
        "join_coverage": compute_join_coverage(bundle),
        "channel_accuracy": compute_channel_accuracy(bundle),
        "room_alias_unresolved": compute_room_alias_unresolved(bundle, room_alias_graph),
        "identity_collision": compute_identity_collision(bundle),
        "branch_missing_rate": compute_branch_missing_rate(bundle),
    }
    return {"ok": not failures, "failures": failures, "metrics": metrics}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--room-alias-graph", default=str(ROOT / "truth_dataset" / "room_alias_graph_v1.json"))
    args = parser.parse_args()

    bundle = load_json(Path(args.bundle))
    room_alias_graph = load_json(Path(args.room_alias_graph))
    result = validate_bundle(bundle, room_alias_graph)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["ok"]:
      raise SystemExit(1)


if __name__ == "__main__":
    main()
