from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_sync import build_apply_guardrails  # noqa: E402


def main() -> None:
    blocked = build_apply_guardrails(
        {
            "validation": {
                "station": {
                    "issues": [
                        {
                            "level": "warn",
                            "code": "TARGET_EXCEEDS_PROVIDER_MAX",
                            "date": "2026-03-02",
                            "message": "Target 5 exceeds provider baseline max 4.",
                        }
                    ]
                },
                "naver": {"issues": []},
            },
            "station": {
                "warnings": [
                    {
                        "provider": "STATION",
                        "code": "STATION_NO_PRICE_SET_ID",
                        "date": "2026-03-03",
                        "message": "[station] no priceSetId for 2026-03-03",
                    }
                ]
            },
        }
    )
    assert blocked["blocked"] is True
    issue_types = {row["type"] for row in blocked["issues"]}
    assert "APPLY_BLOCK_STATION_WARN" in issue_types
    assert "APPLY_BLOCK_STATION_PLAN_WARN" in issue_types

    allowed = build_apply_guardrails(
        {
            "validation": {
                "station": {
                    "issues": [
                        {
                            "level": "warn",
                            "code": "NON_BLOCKING_WARN",
                            "date": "2026-03-02",
                            "message": "This should stay informational.",
                        }
                    ]
                },
                "naver": {"issues": []},
            },
            "station": {"warnings": []},
        }
    )
    assert allowed["blocked"] is False
    assert allowed["issues"] == []

    print("regression_sync_guardrails_py: OK")


if __name__ == "__main__":
    main()
