from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.scan.sheet_scan import (
    apply_note_stay_override,
    classify_color_cell,
    detect_branch_label,
    extract_numeric_reservation_no,
    infer_candidate_channel_from_cell,
    normalize_room_no,
    resolve_provider_alias,
    room_no_alias_keys,
    resolve_closest_mapped_color_key,
    select_room_type,
)
from src.scan.sheet_scan import parse_note_info
from src.domain.sheet_domain import ensure_channel_note_prefix, normalize_platform_name


def main() -> None:
    note = "예약번호: AB1234567\n예약자: 홍길동"
    note_info = parse_note_info(note)
    assert extract_numeric_reservation_no(note, note_info) == "AB1234567"

    note_phone = "예약번호: 6224\n연락처: +1 2135454508\n투숙 기간: 2026-03-08 - 2026-03-10\n예약자: 홍길동"
    note_phone_info = parse_note_info(note_phone)
    assert extract_numeric_reservation_no(note_phone, note_phone_info) == "6224"

    checkin, checkout, nights = apply_note_stay_override(
        dt.date(2026, 3, 8),
        dt.date(2026, 3, 9),
        1,
        note_phone_info,
    )
    assert checkin.isoformat() == "2026-03-08"
    assert checkout.isoformat() == "2026-03-10"
    assert nights == 2

    assert detect_branch_label("The Gangnam") == "GANGNAM"
    assert detect_branch_label("더 코엑스") == "COEX"
    assert detect_branch_label("더 삼성") == "BRANCH_THE_SAMSEONG"
    assert detect_branch_label("The Seolleung") == "BRANCH_THE_SEOLLEUNG"
    assert detect_branch_label("선릉") == "BRANCH_THE_SEOLLEUNG"
    assert detect_branch_label("samseong") == "BRANCH_THE_SAMSEONG"

    # near NAVER color variant should snap to known key
    assert resolve_closest_mapped_color_key("34a954") == "34a853"

    status, channel, error = classify_color_cell("f6b26b", note="8인 - 테스트", formatted_value="123000")
    assert status == "OCCUPIED"
    assert channel == "UNKNOWN"
    assert error is None

    assert normalize_room_no("B1101") == "B1101"
    assert normalize_room_no(" 1101 ") == "1101"
    assert "A301" in room_no_alias_keys("1301")
    assert resolve_provider_alias("Naver Urban Spa Suite") == "NAVER"
    assert resolve_provider_alias("스테이션 6인 객실") == "STATION"
    assert resolve_provider_alias("아고다 판매 객실") == "AGODA"
    assert resolve_provider_alias("Trip.com allotment") == "TRIP"
    assert resolve_provider_alias("부킹닷컴 재고") == "BOOKING"
    assert resolve_provider_alias("에어비앤비 운영") == "AIRBNB"
    assert resolve_provider_alias("익스피디아 allotment") == "EXPEDIA"

    assert normalize_platform_name("booking com") == "BOOKING"
    assert normalize_platform_name("트립닷컴 단건") == "TRIP"
    assert normalize_platform_name("에어비엔비 예약") == "AIRBNB"
    assert normalize_platform_name("익스피디아+에어비앤비") == "EXPEDIA"
    assert normalize_platform_name("디다트레블-코엑스") == "DIDA_TRAVEL"
    assert ensure_channel_note_prefix("예약번호: 1234", "booking") == "[CHANNEL: BOOKING] 예약번호: 1234"
    assert ensure_channel_note_prefix("[CHANNEL: BOOKING] 예약번호: 1234", "BOOKING") == "[CHANNEL: BOOKING] 예약번호: 1234"
    assert infer_candidate_channel_from_cell("", "[CHANNEL: TRIP] 예약번호: 1234") == "TRIP"

    room_type, room_type_source = select_room_type("Urban Spa Suite 6in", "Grand Spa Suite 8in")
    assert room_type == "Grand Spa Suite 8in"
    assert room_type_source == "label_override"

    print("regression_sheet_scan_py: OK")


if __name__ == "__main__":
    main()
