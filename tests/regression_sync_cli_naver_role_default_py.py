from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_sync import (  # noqa: E402
    build_parser,
    build_provider_fetch_error_summary,
)


def main() -> None:
    args = build_parser().parse_args([])
    assert args.naver_role == ""

    error_summary = build_provider_fetch_error_summary(
        "naver",
        room_ids=["7163354"],
        targets={"2026-03-06": 2},
        exc=RuntimeError("probe failed"),
    )
    assert error_summary["error"]["type"] == "RuntimeError"
    assert error_summary["reconciliation"]["available"] is False
    assert error_summary["reconciliation"]["rows"][0]["status"] == "unavailable"
    assert error_summary["warnings"][0]["code"] == "NAVER_FETCH_FAILED"

    print("regression_sync_cli_naver_role_default_py: OK")


if __name__ == "__main__":
    main()
