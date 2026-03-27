from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> None:
    payload = json.loads((ROOT / "truth_dataset" / "branch_provider_mapping_v1.json").read_text(encoding="utf-8"))
    branches = {item["branch"]: item for item in payload["branches"]}

    assert set(branches) == {"COEX", "GANGNAM", "BRANCH_THE_SEOLLEUNG", "BRANCH_THE_SAMSEONG"}

    for branch, expected_status in {
        "COEX": "active",
        "GANGNAM": "active",
        "BRANCH_THE_SEOLLEUNG": "active",
        "BRANCH_THE_SAMSEONG": "preopen",
    }.items():
        entry = branches[branch]
        assert entry["operational_status"] == expected_status
        assert entry["sheet_scope"]["sheet_name"] == "2026"
        assert entry["sheet_tabs"] == ["2026"]
        assert entry["sheet_section_markers"]

    assert "코엑스2" not in json.dumps(payload, ensure_ascii=False)

    print("regression_branch_provider_mapping_py: OK")


if __name__ == "__main__":
    main()
