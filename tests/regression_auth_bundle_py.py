from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_sync import (  # noqa: E402
    build_cookie_header_from_records,
    extract_auth_headers_from_bundle,
    select_provider_auth_bundle,
)


def main() -> None:
    combined = {
        "authBundles": {
            "naver-partner": {
                "providerType": "naver-partner",
                "cookies": [
                    {"name": "NID_SES", "value": "abc", "domain": ".naver.com", "path": "/"},
                    {"name": "XSRF-TOKEN", "value": "csrf123", "domain": ".booking.naver.com", "path": "/"},
                ],
                "csrfToken": "csrf123",
                "role": "OWNER",
            },
            "admin-station": {
                "providerType": "admin-station",
                "accessToken": "station-token-value",
            },
        }
    }

    assert select_provider_auth_bundle(combined, "naver-partner") == combined["authBundles"]["naver-partner"]
    assert select_provider_auth_bundle(combined, "admin-station") == combined["authBundles"]["admin-station"]

    cookie_header = build_cookie_header_from_records(combined["authBundles"]["naver-partner"]["cookies"])
    assert cookie_header == "NID_SES=abc; XSRF-TOKEN=csrf123"

    naver_headers = extract_auth_headers_from_bundle(combined, "naver-partner")
    assert naver_headers["Cookie"] == cookie_header
    assert naver_headers["x-csrf-token"] == "csrf123"
    assert naver_headers["x-booking-naver-role"] == "OWNER"

    station_headers = extract_auth_headers_from_bundle(combined, "admin-station")
    assert station_headers["Authorization"] == "Bearer station-token-value"

    direct_station = {
        "providerType": "admin-station",
        "authorization": "Bearer already-prefixed",
    }
    direct_headers = extract_auth_headers_from_bundle(direct_station, "admin-station")
    assert direct_headers["Authorization"] == "Bearer already-prefixed"

    print("regression_auth_bundle_py: OK")


if __name__ == "__main__":
    main()
