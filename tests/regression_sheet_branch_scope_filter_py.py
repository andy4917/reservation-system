from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_audit import parse_branch_scope  # noqa: E402


def main() -> None:
    parsed = parse_branch_scope("강남, coex\n강남, BRANCH_THE_SEOLLEUNG")
    assert parsed == ["GANGNAM", "COEX", "BRANCH_THE_SEOLLEUNG"]

    empty = parse_branch_scope("")
    assert empty == []

    unknown = parse_branch_scope("some_custom_branch")
    assert unknown == ["SOME_CUSTOM_BRANCH"]

    print("regression_sheet_branch_scope_filter_py: OK")


if __name__ == "__main__":
    main()
