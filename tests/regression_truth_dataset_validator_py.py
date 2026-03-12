from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.validate_truth_dataset import load_json, validate_bundle


def main() -> None:
    bundle = load_json(ROOT / "truth_dataset" / "fixtures" / "sample_live_capture_bundle.json")
    room_alias_graph = load_json(ROOT / "truth_dataset" / "room_alias_graph_v1.json")
    result = validate_bundle(bundle, room_alias_graph)

    assert result["ok"] is True
    assert result["failures"] == []
    assert result["metrics"]["join_coverage"]["reservation_joined"] == 2
    assert result["metrics"]["join_coverage"]["room_joined"] == 2
    assert result["metrics"]["channel_accuracy"]["mapped"] == 6
    assert result["metrics"]["room_alias_unresolved"]["unresolved"] == 0
    assert result["metrics"]["identity_collision"]["collisions"] == 0
    assert result["metrics"]["branch_missing_rate"]["COEX"]["missing"] == 0
    assert result["metrics"]["branch_missing_rate"]["GANGNAM"]["missing"] == 0

    print("regression_truth_dataset_validator_py: OK")


if __name__ == "__main__":
    main()
