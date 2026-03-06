from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_sync import sanitize_naver_schedule_headers  # noqa: E402


def main() -> None:
    base = {
        "origin": "https://partner.booking.naver.com",
        "x-booking-naver-role": "OWNER",
        "x-csrf-token": "csrf-1",
    }
    stripped = sanitize_naver_schedule_headers(base, role_override="")
    assert "x-booking-naver-role" not in {k.lower(): v for k, v in stripped.items()}
    assert stripped.get("x-csrf-token") == "csrf-1"

    forced = sanitize_naver_schedule_headers(base, role_override="PARTNER")
    lowered = {k.lower(): v for k, v in forced.items()}
    assert lowered.get("x-booking-naver-role") == "PARTNER"

    print("regression_sync_naver_role_header_strategy_py: OK")


if __name__ == "__main__":
    main()
