from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.reconcile.sheet_reconcile import room_alias_keys


def build_graph() -> dict:
    baseline_path = ROOT / "room_registry_baseline.json"
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    nodes = []
    edges = []
    for row in baseline.get("rows", []):
        canonical_id = str(row.get("canonical_id") or "").strip()
        branch = str(row.get("branch") or "").strip()
        if not canonical_id or not branch:
            continue
        sheet_room_no = str(row.get("sheet_room_no") or "").strip()
        pms_room_no = str(row.get("pms_room_no") or "").strip()
        derived_aliases = sorted(
            {
                alias
                for token in (sheet_room_no, pms_room_no, str(row.get("room_number") or "").strip())
                if token
                for alias in room_alias_keys(token)
            }
        )
        node = {
            "canonical_room_id": canonical_id,
            "branch": branch,
            "building": str(row.get("building") or "").strip(),
            "room_number": str(row.get("room_number") or "").strip(),
            "aliases": [
                {"source_system": "SHEET", "raw_value": sheet_room_no},
                {"source_system": "WINGS", "raw_value": pms_room_no}
            ],
            "derived_aliases": derived_aliases
        }
        nodes.append(node)
        for alias in derived_aliases:
            edges.append(
                {
                    "from": canonical_id,
                    "to": alias,
                    "type": "room_alias"
                }
            )
    return {
        "graph_version": "room-alias-graph-v1",
        "source": "room_registry_baseline.json",
        "node_count": len(nodes),
        "edge_count": len(edges),
        "nodes": nodes,
        "edges": edges
    }


def main() -> None:
    graph = build_graph()
    out_path = ROOT / "truth_dataset" / "room_alias_graph_v1.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
