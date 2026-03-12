from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.validate_truth_dataset import load_json, validate_bundle


ENTITY_NAMES = [
    "sheet_rows",
    "wings_reservations",
    "ota_inventory_rows",
    "ota_reservations",
    "bridge_events",
]


def resolve_repo_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return ROOT / path


def load_spec(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_bundle_from_spec(spec: dict[str, Any]) -> dict[str, Any]:
    contract_version = str(spec.get("contract_version") or "canonical-data-contract-v1")
    manifest_path = resolve_repo_path(str(spec.get("manifest_path") or ""))
    entity_paths = spec.get("entity_paths") or {}
    manifest = load_json(manifest_path)
    entities: dict[str, Any] = {}
    for name in ENTITY_NAMES:
        raw_path = entity_paths.get(name)
        if not raw_path:
            raise ValueError(f"entity path missing: {name}")
        rows = load_json(resolve_repo_path(str(raw_path)))
        if not isinstance(rows, list):
            raise ValueError(f"entity file must contain a list: {name}")
        entities[name] = rows
    return {
        "contract_version": contract_version,
        "manifest": manifest,
        "entities": entities,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--room-alias-graph", default=str(ROOT / "truth_dataset" / "room_alias_graph_v1.json"))
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    spec = load_spec(resolve_repo_path(args.spec))
    bundle = build_bundle_from_spec(spec)
    room_alias_graph = load_json(resolve_repo_path(args.room_alias_graph))
    validation = validate_bundle(bundle, room_alias_graph)
    if not validation["ok"]:
        print(json.dumps(validation, ensure_ascii=False, indent=2))
        raise SystemExit(1)

    output_path = resolve_repo_path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "output": str(output_path), "metrics": validation["metrics"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
