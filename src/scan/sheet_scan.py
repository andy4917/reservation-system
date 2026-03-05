from __future__ import annotations

import datetime as dt
import hashlib
import re
from bisect import bisect_right
from collections import Counter, defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

from src.domain.sheet_domain import (
    ACCOUNT_FIELD_ALIASES,
    BRANCH_COEX,
    BRANCH_GANGNAM,
    BRANCH_SPLIT_ROW,
    CELL_STATUS_BLOCKED,
    CELL_STATUS_OCCUPIED,
    CELL_STATUS_UNKNOWN,
    CELL_STATUS_VACANT,
    CHECKIN_CHECKOUT_RE,
    COLOR_STATUS_CHANNEL_MAP,
    DATE_HEADER_HINT_COL,
    DATE_HEADER_HINT_ROW,
    DATE_WEEKDAY_HINT_ROW,
    DATE_LABEL_RE,
    IGNORED_COLOR_HEX,
    DailyStat,
    DateColumn,
    InventoryValue,
    NoteInfo,
    ReservationBlock,
    ROOM_CAPACITY_BY_TYPE,
    ROOM_NO_RE,
    ROOM_TYPE_BY_ROOM_NO,
    RESERVATION_NUMBER_RE,
    RoomIdentity,
    RoomRow,
    TOTAL_ROOMS_EXPECTED,
    AuditError,
    Cell,
    normalize_text,
    normalize_platform_name,
    normalize_room_no_key,
    parse_date_label,
    parse_money_to_int,
    try_parse_iso_date,
)
from src.io.sheets_api import GoogleSheetsReadonlyClient


def parse_api_cell(row: int, col: int, raw: Dict[str, Any]) -> Cell:
    formatted = normalize_text(raw.get("formattedValue"))
    note = raw.get("note") or ""
    eff = raw.get("effectiveFormat", {})
    uef = raw.get("userEnteredFormat", {})
    bg = eff.get("backgroundColor") or uef.get("backgroundColor")
    return Cell(
        row=row,
        col=col,
        formatted_value=formatted,
        note=note,
        background_color=bg,
        background_hex=color_to_hex(bg),
        borders=None,
    )


def color_to_hex(color: Optional[Dict[str, float]]) -> Optional[str]:
    if not color:
        return None
    red = int(round(float(color.get("red", 0.0)) * 255))
    green = int(round(float(color.get("green", 0.0)) * 255))
    blue = int(round(float(color.get("blue", 0.0)) * 255))
    red = min(max(red, 0), 255)
    green = min(max(green, 0), 255)
    blue = min(max(blue, 0), 255)
    return f"{red:02x}{green:02x}{blue:02x}"


def parse_note_info(note: str) -> NoteInfo:
    text = note or ""
    info = NoteInfo()

    people_m = re.search(r"(\d+)\s*(?:명|인|pax)?", text, flags=re.I)
    if people_m:
        info.people = int(people_m.group(1))

    no_m = RESERVATION_NUMBER_RE.search(text)
    if no_m:
        info.reservation_no = no_m.group(1).strip()

    guest_m = re.search(r"(?:예약자|guest)\s*[:：]?\s*(.+)", text, flags=re.I)
    if guest_m:
        info.guest_name = normalize_text(guest_m.group(1))

    nat_m = re.search(r"(?:국적\s*및\s*박수|nationality)\s*[:：]?\s*(.+)", text, flags=re.I)
    if nat_m:
        info.nationality_nights = normalize_text(nat_m.group(1))

    phone_m = re.search(r"(?:연락처|phone)\s*[:：]?\s*([0-9+\-() ]+)", text, flags=re.I)
    if phone_m:
        info.phone = normalize_text(phone_m.group(1))

    stay_m = CHECKIN_CHECKOUT_RE.search(text)
    if stay_m:
        info.stay_checkin = try_parse_iso_date(stay_m.group(1))
        info.stay_checkout = try_parse_iso_date(stay_m.group(2))

    return info

class SheetMatrix:
    def __init__(self, start_row: int, start_col: int, row_data: List[Dict[str, Any]]):
        self.start_row = start_row
        self.start_col = start_col
        self.cells: Dict[Tuple[int, int], Cell] = {}
        self.max_row = start_row
        self.max_col = start_col
        for row_offset, row_obj in enumerate(row_data):
            abs_row = start_row + row_offset
            values = row_obj.get("values", [])
            for col_offset, val in enumerate(values):
                abs_col = start_col + col_offset
                cell = parse_api_cell(abs_row, abs_col, val)
                self.cells[(abs_row, abs_col)] = cell
                self.max_col = max(self.max_col, abs_col)
            self.max_row = max(self.max_row, abs_row)

    def get(self, row: int, col: int) -> Cell:
        return self.cells.get((row, col), Cell(row=row, col=col))

    def iter_rows(self, row_start: int, row_end: int) -> Iterable[int]:
        end = min(row_end, self.max_row)
        for row in range(row_start, end + 1):
            yield row


def branch_from_row(row_index: int) -> str:
    return BRANCH_GANGNAM if row_index < BRANCH_SPLIT_ROW else BRANCH_COEX


BRANCH_LABEL_RULES: Tuple[Tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?:^|\b)gangnam(?:\b|$)|강남", flags=re.I), BRANCH_GANGNAM),
    (re.compile(r"(?:^|\b)coex(?:\b|$)|코엑스", flags=re.I), BRANCH_COEX),
)
BRANCH_MARKER_HINT_RE = re.compile(r"(?:\bthe\b|더\s*|지점|branch)", flags=re.I)
ROOM_NO_LIKE_RE = re.compile(r"^(?:A\d{3,4}|\d{3,4})$", flags=re.I)
ROOM_NO_EXTRACT_RE = re.compile(r"(?:^|[^0-9A-Z])([AB]?\d{3,4})(?:[^0-9A-Z]|$)", flags=re.I)
PROVIDER_HINT_TOKENS = (
    "station",
    "스테이션",
    "naver",
    "네이버",
    "agoda",
    "booking",
    "trip",
    "airbnb",
    "expedia",
    "yanolja",
    "traveloka",
    "dida",
    "here",
    "coupang",
)
LONG_TAIL_OTA_HINTS: Tuple[Tuple[str, str], ...] = (
    ("agoda", "AGODA"),
    ("아고다", "AGODA"),
    ("booking.com", "BOOKING"),
    ("booking", "BOOKING"),
    ("부킹닷컴", "BOOKING"),
    ("부킹", "BOOKING"),
    ("trip.com", "TRIP"),
    ("trip", "TRIP"),
    ("트립닷컴", "TRIP"),
    ("트립", "TRIP"),
    ("ctrip", "TRIP"),
    ("airbnb", "AIRBNB"),
    ("air bnb", "AIRBNB"),
    ("에어비앤비", "AIRBNB"),
    ("에어비엔비", "AIRBNB"),
    ("expedia", "EXPEDIA"),
    ("익스피디아", "EXPEDIA"),
    ("trivago", "TRIVAGO"),
    ("traveloka", "TRAVELOKA"),
    ("yanolja", "YANOLJA"),
    ("야놀자", "YANOLJA"),
    ("여기어때", "HERE"),
    ("here", "HERE"),
    ("dida", "DIDA_TRAVEL"),
    ("디다트레블", "DIDA_TRAVEL"),
    ("디다트래블", "DIDA_TRAVEL"),
    ("인터파크", "DIDA_TRAVEL"),
    ("interpark", "DIDA_TRAVEL"),
    ("놀인터파크", "DIDA_TRAVEL"),
    ("coex", BRANCH_COEX),
    ("gangnam", BRANCH_GANGNAM),
    ("스테이션", "STATION"),
    ("station", "STATION"),
    ("네이버", "NAVER"),
    ("naver", "NAVER"),
)
PREFERRED_BRANCH_ORDER = {
    BRANCH_GANGNAM: 0,
    BRANCH_COEX: 1,
}
ROOM_STATUS_TEXT_HINTS = {
    "vac",
    "vip",
    "ooo",
    "marketing",
    "마케팅",
    "닫음",
    "마감",
    "closed",
    "soldout",
    "off",
}
ROW_SKIP_TOKENS = (
    "합계",
    "total",
    "room sold",
    "sold",
    "naver",
    "station",
    "네이버",
    "스테이션",
    "the gangnam",
    "the coex",
    "더 강남",
    "더 코엑스",
)
PROVIDER_ALIAS_RULES = {
    "STATION": ("station", "스테이션", "uh suite", "uhsuite"),
    "NAVER": ("naver", "네이버"),
    "AGODA": ("agoda", "아고다"),
    "BOOKING": ("booking", "booking.com", "부킹", "부킹닷컴"),
    "TRIP": ("trip", "trip.com", "ctrip", "트립", "트립닷컴"),
    "AIRBNB": ("airbnb", "air bnb", "에어비앤비", "에어비엔비"),
    "EXPEDIA": ("expedia", "익스피디아"),
    "TRAVELOKA": ("traveloka",),
    "YANOLJA": ("yanolja", "야놀자"),
    "HERE": ("here", "여기어때"),
    "COUPANG_TRAVEL": ("coupang", "쿠팡"),
    "DIDA_TRAVEL": (
        "dida",
        "dida travel",
        "interpark",
        "놀인터파크",
        "디다트레블",
        "디다트래블",
    ),
}
BRANCH_NOISE_TOKENS = (
    "suite",
    "spa",
    "객실",
    "room",
    "urban",
    "double",
    "grand",
)


def sort_branch_keys(branch_keys: Iterable[str]) -> List[str]:
    uniq = {normalize_text(k) for k in branch_keys if normalize_text(k)}
    return sorted(
        uniq,
        key=lambda value: (PREFERRED_BRANCH_ORDER.get(value, 99), value),
    )


def normalize_branch_slug(raw: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z가-힣]+", "_", normalize_text(raw))
    slug = re.sub(r"_+", "_", slug).strip("_")
    if not slug:
        return ""
    return f"BRANCH_{slug[:32].upper()}"


def detect_branch_label(raw: str) -> str:
    text = normalize_text(raw)
    if not text:
        return ""
    compact = text.replace(" ", "").upper()
    if ROOM_NO_LIKE_RE.match(compact):
        return ""
    low = text.lower()
    if any(token in low for token in PROVIDER_HINT_TOKENS):
        return ""
    for pattern, branch in BRANCH_LABEL_RULES:
        if pattern.search(text):
            return branch
    if BRANCH_MARKER_HINT_RE.search(text):
        low = text.lower()
        if re.search(r"\d", text):
            return ""
        if any(token in low for token in BRANCH_NOISE_TOKENS):
            return ""
        return normalize_branch_slug(text)
    return ""


def detect_branch_markers(matrix: SheetMatrix, row_start: int, row_end: int) -> List[Dict[str, Any]]:
    markers: List[Dict[str, Any]] = []
    for row in matrix.iter_rows(row_start, row_end):
        col_a = normalize_text(matrix.get(row, 0).formatted_value)
        col_b = normalize_text(matrix.get(row, 1).formatted_value)
        merged = normalize_text(f"{col_a} {col_b}")
        branch = detect_branch_label(merged)
        if not branch:
            continue
        if markers and markers[-1]["branch"] == branch and (row - markers[-1]["row"] <= 2):
            continue
        markers.append(
            {
                "row": row,
                "branch": branch,
                "label": merged,
            }
        )
    return markers


def build_row_branch_resolver(markers: List[Dict[str, Any]]):
    if not markers:
        return lambda row: branch_from_row(row)
    sorted_markers = sorted(markers, key=lambda item: int(item["row"]))
    marker_rows = [int(item["row"]) for item in sorted_markers]
    marker_branches = [normalize_text(item["branch"]) for item in sorted_markers]

    def resolve(row: int) -> str:
        idx = bisect_right(marker_rows, int(row)) - 1
        if idx >= 0:
            branch = marker_branches[idx]
            if branch:
                return branch
        return branch_from_row(row)

    return resolve


def infer_candidate_channel_from_cell(formatted_value: str, note: str) -> str:
    text = normalize_text(f"{formatted_value} {note}").lower()
    if not text:
        return ""
    for hint, channel in LONG_TAIL_OTA_HINTS:
        if hint in text:
            return channel
    return ""


def normalize_probe_text(value: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]+", "", normalize_text(value).lower())


def is_skip_row_text(value: str) -> bool:
    low = normalize_text(value).lower()
    if not low:
        return False
    return any(token in low for token in ROW_SKIP_TOKENS)


def normalize_room_no(value: str) -> str:
    raw = normalize_text(value).upper().replace(" ", "")
    if not raw:
        return ""
    raw = raw.replace("-", "")
    # Keep canonical forms directly when already shaped.
    if re.fullmatch(r"[AB]\d{3,4}", raw):
        return raw
    if re.fullmatch(r"\d{3,4}", raw):
        return raw
    m = ROOM_NO_EXTRACT_RE.search(raw)
    if not m:
        return ""
    token = normalize_text(m.group(1)).upper()
    if re.fullmatch(r"[AB]?\d{3,4}", token):
        return token
    return ""


def room_no_alias_keys(room_no: str) -> List[str]:
    key = normalize_room_no(room_no)
    if not key:
        return []
    keys = [key]
    if key.startswith("B") and key[1:].isdigit():
        keys.append(str(int(key[1:])))
    if key.startswith("A") and key[1:].isdigit():
        n = int(key[1:])
        keys.append(str(n + 1000))
    if key.isdigit():
        n = int(key)
        if n >= 1301:
            keys.append(f"A{n - 1000}")
        keys.append(f"B{n}")
    out: List[str] = []
    seen: set[str] = set()
    for item in keys:
        norm = normalize_room_no(item)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        out.append(norm)
    return out


def is_type_room_header(matrix: SheetMatrix, row: int) -> bool:
    col_a = normalize_text(matrix.get(row, 0).formatted_value).lower()
    col_b = normalize_text(matrix.get(row, 1).formatted_value).lower()
    return col_a == "type" and col_b == "room"


def detect_room_section_headers(matrix: SheetMatrix, row_start: int, row_end: int) -> List[int]:
    headers: List[int] = []
    for row in matrix.iter_rows(row_start, row_end):
        if is_type_room_header(matrix, row):
            headers.append(row)
    return headers


def is_room_section_terminator_row(matrix: SheetMatrix, row: int) -> bool:
    col_a = normalize_text(matrix.get(row, 0).formatted_value).lower()
    col_b = normalize_text(matrix.get(row, 1).formatted_value).lower()
    text = normalize_text(f"{col_a} {col_b}").lower()
    if not text:
        return False
    stop_tokens = (
        "station",
        "st ation",
        "네이버",
        "naver",
        "room sold",
        "취소/변경/결제",
        "최소투숙",
        "판매 상태",
        "cms 연동",
        "금액 인상",
        "야놀자",
    )
    return any(token in text for token in stop_tokens)


def resolve_branch_for_section_header(header_row: int, markers: List[Dict[str, Any]]) -> str:
    selected = ""
    for marker in markers:
        marker_row = int(marker.get("row", -1))
        if marker_row >= header_row:
            break
        selected = normalize_text(marker.get("branch", ""))
    return selected or branch_from_row(header_row)


def build_room_identity(branch: str, room_no: str) -> RoomIdentity:
    normalized_room_no = normalize_room_no(room_no)
    building = ""
    room_number = ""
    m = re.fullmatch(r"([A-Z])(\d{3,4})", normalized_room_no)
    if m:
        building = m.group(1)
        room_number = m.group(2)
    elif re.fullmatch(r"\d{3,4}", normalized_room_no):
        building = "B"
        room_number = normalized_room_no
    else:
        room_number = normalized_room_no

    branch_key = normalize_text(branch).upper()
    canonical_parts = [part for part in (branch_key, building, room_number) if part]
    canonical_id = "-".join(canonical_parts)
    pms_room_no = ""
    if room_number.isdigit():
        number = int(room_number)
        if building == "A":
            pms_room_no = str(number + 1000)
        else:
            pms_room_no = str(number)

    return RoomIdentity(
        branch=branch_key,
        building=building,
        room_number=room_number,
        sheet_room_no=normalized_room_no,
        canonical_id=canonical_id,
        pms_room_no=pms_room_no,
    )


def infer_room_type_from_label(value: str) -> str:
    text = normalize_text(value)
    low = text.lower()
    if not low:
        return ""
    if "urban" in low or "6인" in text:
        return "Urban Spa Suite 6in"
    if ("double" in low and "twin" in low) or "4인" in text:
        return "Double Twin Spa Room 4in"
    if "grand" in low or "8인" in text:
        return "Grand Spa Suite 8in"
    return ""


def extract_room_no_from_row(matrix: SheetMatrix, row: int) -> str:
    # Room number must be read from TYPE/ROOM area only.
    # Date/value columns (C+) can contain payment amounts like 20,000,
    # which must never be parsed as room numbers (e.g. "000").
    probe_cols = (1, 0)
    for col in probe_cols:
        text = normalize_text(matrix.get(row, col).formatted_value)
        if not text:
            continue
        if is_skip_row_text(text):
            continue
        room_no = normalize_room_no(text)
        if room_no:
            return room_no
    return ""


def row_has_room_signals(matrix: SheetMatrix, row: int, date_cols: List[DateColumn]) -> bool:
    if not date_cols:
        return False
    sample_cols = date_cols[: min(len(date_cols), 31)]
    for dc in sample_cols:
        cell = matrix.get(row, dc.col)
        txt = normalize_text(cell.formatted_value)
        note = normalize_text(cell.note)
        hex_color = normalize_text(cell.background_hex).lower()
        if note:
            return True
        if hex_color in IGNORED_COLOR_HEX:
            # Payment/helper color blocks must not promote non-room rows.
            continue
        if hex_color and hex_color != "ffffff":
            return True
        if not txt:
            continue
        low = txt.lower()
        if low in ROOM_STATUS_TEXT_HINTS:
            return True
    return False


def resolve_provider_alias(joined_text: str) -> str:
    compact = normalize_probe_text(joined_text)
    if not compact:
        return ""
    for provider, aliases in PROVIDER_ALIAS_RULES.items():
        for alias in aliases:
            if normalize_probe_text(alias) in compact:
                return normalize_platform_name(provider)
    return ""


def reservation_group_key(block: ReservationBlock) -> str:
    if normalize_text(block.reservation_key):
        return normalize_text(block.reservation_key)
    if block.reservation_no:
        return block.reservation_no
    hash_source = normalize_text(block.note) or f"{block.row}:{block.start_col}:{block.end_col}"
    digest = hashlib.sha1(hash_source.encode("utf-8")).hexdigest()[:12]
    return f"note:{digest}"


def hex_to_rgb(hex_color: str) -> Optional[Tuple[int, int, int]]:
    text = normalize_text(hex_color).lower().lstrip("#")
    if not re.fullmatch(r"[0-9a-f]{6}", text):
        return None
    return (
        int(text[0:2], 16),
        int(text[2:4], 16),
        int(text[4:6], 16),
    )


def resolve_closest_mapped_color_key(hex_color: str) -> str:
    source = hex_to_rgb(hex_color)
    if source is None:
        return ""
    max_channel_delta = 3
    max_distance_sq = 18
    best_key = ""
    best_distance = 10 ** 9
    for candidate_key in COLOR_STATUS_CHANNEL_MAP.keys():
        rgb = hex_to_rgb(candidate_key)
        if rgb is None:
            continue
        dr = abs(source[0] - rgb[0])
        dg = abs(source[1] - rgb[1])
        db = abs(source[2] - rgb[2])
        if dr > max_channel_delta or dg > max_channel_delta or db > max_channel_delta:
            continue
        distance = dr * dr + dg * dg + db * db
        if distance > max_distance_sq:
            continue
        if distance < best_distance:
            best_distance = distance
            best_key = candidate_key
    return best_key


def classify_color_cell(
    color_hex: Optional[str],
    note: str = "",
    formatted_value: str = "",
) -> Tuple[str, str, Optional[str]]:
    text_raw = normalize_text(formatted_value)
    text = text_raw.upper()
    note_raw = normalize_text(note)
    note_upper = note_raw.upper()
    ooo_pattern = re.compile(r"(^|[^A-Z0-9])O[\s.\-_/]*O[\s.\-_/]*O([^A-Z0-9]|$)", flags=re.I)

    has_vip = text == "VIP" or note_upper == "VIP"
    has_ooo = text == "OOO" or note_upper == "OOO" or bool(ooo_pattern.search(text_raw)) or bool(ooo_pattern.search(note_raw))
    has_marketing = (
        text in ("MARKETING", "마케팅")
        or note_upper == "MARKETING"
        or ("마케팅" in note_raw)
    )

    if not color_hex:
        if has_vip:
            return CELL_STATUS_BLOCKED, "VIP", None
        if has_ooo:
            return CELL_STATUS_BLOCKED, "OOO", None
        if has_marketing:
            return CELL_STATUS_BLOCKED, "MARKETING", None
        if note_raw:
            return CELL_STATUS_OCCUPIED, "UNKNOWN", None
        return CELL_STATUS_VACANT, "", None
    key = normalize_text(color_hex).lower()
    if not key:
        if has_vip:
            return CELL_STATUS_BLOCKED, "VIP", None
        if has_ooo:
            return CELL_STATUS_BLOCKED, "OOO", None
        if has_marketing:
            return CELL_STATUS_BLOCKED, "MARKETING", None
        if note_raw:
            return CELL_STATUS_OCCUPIED, "UNKNOWN", None
        return CELL_STATUS_VACANT, "", None
    if key in IGNORED_COLOR_HEX:
        return CELL_STATUS_UNKNOWN, "", None

    mapped_key = key if key in COLOR_STATUS_CHANNEL_MAP else resolve_closest_mapped_color_key(key)
    mapped = COLOR_STATUS_CHANNEL_MAP.get(mapped_key)
    if mapped:
        return mapped["status"], mapped["channel"], None

    if has_vip:
        return CELL_STATUS_BLOCKED, "VIP", f"UNKNOWN_COLOR({key})"
    if has_ooo:
        return CELL_STATUS_BLOCKED, "OOO", f"UNKNOWN_COLOR({key})"
    if has_marketing:
        return CELL_STATUS_BLOCKED, "MARKETING", f"UNKNOWN_COLOR({key})"
    if note_raw:
        return CELL_STATUS_OCCUPIED, "UNKNOWN", f"UNKNOWN_COLOR({key})"
    return CELL_STATUS_UNKNOWN, "", f"UNKNOWN_COLOR({key})"

def extract_numeric_reservation_no(note: str, note_info: NoteInfo) -> Optional[str]:
    text = note or ""
    candidates: List[str] = []
    if note_info.reservation_no:
        candidates.append(note_info.reservation_no)
    tagged_matches = re.findall(
        r"(?:예약번호|reservation(?:_|\s*)number|rsvn(?:_|\s*)no)\s*[:#：]?\s*([0-9A-Za-z_-]+)",
        text,
        flags=re.I,
    )
    candidates.extend(tagged_matches)
    loose_matches = re.findall(r"\b\d{6,}\b", text)
    candidates.extend(loose_matches)
    for cand in candidates:
        digits = "".join(re.findall(r"\d+", normalize_text(cand)))
        if len(digits) >= 6:
            return digits
    return None


def build_note_fallback_key(note_info: NoteInfo) -> Optional[str]:
    name = normalize_text(note_info.guest_name).lower()
    period = ""
    if note_info.stay_checkin and note_info.stay_checkout:
        period = f"{note_info.stay_checkin.isoformat()}_{note_info.stay_checkout.isoformat()}"
    elif note_info.stay_checkin:
        period = note_info.stay_checkin.isoformat()
    if not name or not period:
        return None
    return normalize_text(f"{name} {period}")


def parse_reservation_identity(note: str) -> Dict[str, Any]:
    text = note or ""
    note_info = parse_note_info(text)
    reservation_no = extract_numeric_reservation_no(text, note_info)
    name_period_key = build_note_fallback_key(note_info)
    reservation_key = reservation_no or name_period_key
    used_raw_note_fallback = False
    if not reservation_key and normalize_text(text):
        digest = hashlib.sha1(normalize_text(text).encode("utf-8")).hexdigest()[:12]
        reservation_key = f"note:{digest}"
        used_raw_note_fallback = True
    note_parse_fail = bool(normalize_text(text)) and (
        not bool(reservation_no) and not bool(name_period_key)
    )
    return {
        "note_info": note_info,
        "reservation_no": reservation_no,
        "reservation_key": reservation_key,
        "used_raw_note_fallback": used_raw_note_fallback,
        "note_parse_fail": note_parse_fail,
    }


def parse_stock_value(raw: str) -> InventoryValue:
    text = normalize_text(raw)
    if not text:
        return InventoryValue(raw="", current=None, maximum=None)
    if "/" in text:
        numbers = [int(x) for x in re.findall(r"\d+", text)]
        if len(numbers) >= 2:
            return InventoryValue(raw=text, current=numbers[0], maximum=numbers[1])
    if re.fullmatch(r"\d+", text):
        return InventoryValue(raw=text, current=int(text), maximum=None)
    return InventoryValue(raw=text, current=None, maximum=None)


def find_date_columns(
    matrix: SheetMatrix, start_row: int, year: int
) -> Tuple[int, List[DateColumn]]:
    def _build_cols_for_row(row: int) -> List[DateColumn]:
        cols: List[DateColumn] = []
        for col in range(2, matrix.max_col + 1):
            cell = matrix.get(row, col)
            date_val = parse_date_label(cell.formatted_value, year)
            if date_val:
                cols.append(DateColumn(col=col, date=date_val, label=cell.formatted_value))
        return cols

    hinted_date = parse_date_label(
        matrix.get(DATE_HEADER_HINT_ROW, DATE_HEADER_HINT_COL).formatted_value, year
    )
    if hinted_date:
        hinted_cols = _build_cols_for_row(DATE_HEADER_HINT_ROW)
        if len(hinted_cols) >= 7:
            for item in hinted_cols:
                item.weekday_label = normalize_text(
                    matrix.get(DATE_WEEKDAY_HINT_ROW, item.col).formatted_value
                )
            return DATE_HEADER_HINT_ROW, sorted(hinted_cols, key=lambda x: x.col)

    best_row = -1
    best_date_cols: List[DateColumn] = []
    for row in matrix.iter_rows(start_row, matrix.max_row):
        cols = _build_cols_for_row(row)
        if len(cols) > len(best_date_cols):
            best_date_cols = cols
            best_row = row

    if best_row < 0 or len(best_date_cols) < 7:
        raise AuditError(
            "?醫롮? ??삳쐭 ??깆뱽 筌≪뼚? 筌륁궢六??щ빍?? '3??13?? ?類ㅻ뻼???醫롮? ?????겸뫖???? ??녿뮸??덈뼄."
        )

    weekday_row = best_row + 1
    for item in best_date_cols:
        item.weekday_label = normalize_text(
            matrix.get(weekday_row, item.col).formatted_value
        )
    return best_row, sorted(best_date_cols, key=lambda x: x.col)


def date_columns_from_batch_header_row(
    client: GoogleSheetsReadonlyClient,
    spreadsheet_id: str,
    sheet_name: str,
    header_row_zero_based: int,
    year: int,
) -> List[DateColumn]:
    safe_title = f"'{sheet_name}'" if " " in sheet_name else sheet_name
    row_1based = header_row_zero_based + 1
    range_a1 = f"{safe_title}!C{row_1based}:ZZ{row_1based}"
    value_ranges = client.batch_get_values(
        spreadsheet_id=spreadsheet_id,
        ranges=[range_a1],
        major_dimension="ROWS",
        value_render_option="FORMATTED_VALUE",
    )
    if not value_ranges:
        return []
    row_values = value_ranges[0].get("values", [])
    if not isinstance(row_values, list) or not row_values:
        return []
    first_row = row_values[0]
    if not isinstance(first_row, list):
        return []
    cols: List[DateColumn] = []
    for idx, value in enumerate(first_row):
        date_val = parse_date_label(str(value), year)
        if not date_val:
            continue
        cols.append(
            DateColumn(
                col=2 + idx,
                date=date_val,
                label=normalize_text(str(value)),
            )
        )
    return sorted(cols, key=lambda x: x.col)


def map_room_rows(
    matrix: SheetMatrix,
    date_cols: List[DateColumn],
    scan_row_start: int,
    room_row_logs: Optional[List[Dict[str, Any]]] = None,
) -> Dict[int, RoomRow]:
    room_rows: Dict[int, RoomRow] = {}
    branch_markers = detect_branch_markers(matrix, matrix.start_row, matrix.max_row)
    section_headers = detect_room_section_headers(matrix, matrix.start_row, matrix.max_row)
    section_ranges: List[Dict[str, Any]] = []
    if section_headers:
        sorted_headers = sorted(set(section_headers))
        for idx, header_row in enumerate(sorted_headers):
            next_header = sorted_headers[idx + 1] if (idx + 1) < len(sorted_headers) else (matrix.max_row + 1)
            section_ranges.append(
                {
                    "header_row": header_row,
                    "start_row": header_row + 1,
                    "end_row": min(next_header - 1, matrix.max_row),
                    "branch": resolve_branch_for_section_header(header_row, branch_markers),
                }
            )
    else:
        section_ranges.append(
            {
                "header_row": scan_row_start - 1,
                "start_row": scan_row_start,
                "end_row": matrix.max_row,
                "branch": branch_from_row(scan_row_start),
            }
        )

    def append_row_log(
        *,
        row: int,
        row_type: str,
        room_no: str,
        parsed_room_type: str,
        room_type_source: str,
        raw_text: str,
        branch: str = "",
        building: str = "",
        room_number: str = "",
        sheet_room_no: str = "",
        canonical_id: str = "",
        pms_room_no: str = "",
    ) -> None:
        if room_row_logs is None:
            return
        room_row_logs.append(
            {
                "room_row": int(row) + 1,
                "row_type": normalize_text(row_type).lower(),
                "branch": normalize_text(branch).upper(),
                "room_no": normalize_text(room_no),
                "building": normalize_text(building).upper(),
                "room_number": normalize_text(room_number),
                "sheet_room_no": normalize_text(sheet_room_no).upper(),
                "canonical_id": normalize_text(canonical_id).upper(),
                "pms_room_no": normalize_text(pms_room_no),
                "parsed_room_type": normalize_text(parsed_room_type),
                "room_type_source": normalize_text(room_type_source).lower(),
                "raw_text": normalize_text(raw_text),
            }
        )

    for section in section_ranges:
        start_row = int(section["start_row"])
        end_row = int(section["end_row"])
        section_branch = normalize_text(section.get("branch", ""))
        current_room_type = ""
        blank_streak = 0
        found_room_in_section = False

        for row in matrix.iter_rows(start_row, end_row):
            room_type_raw = normalize_text(matrix.get(row, 0).formatted_value)
            room_col_raw = normalize_text(matrix.get(row, 1).formatted_value)
            if room_type_raw:
                current_room_type = room_type_raw
            raw_text = room_type_raw or current_room_type
            has_room_signal = row_has_room_signals(matrix, row, date_cols)

            is_blank = (not room_type_raw) and (not room_col_raw) and (not has_room_signal)
            if is_blank:
                blank_streak += 1
            else:
                blank_streak = 0

            if found_room_in_section and blank_streak >= 3:
                break
            if (not found_room_in_section) and blank_streak >= 10:
                break
            if is_room_section_terminator_row(matrix, row):
                if found_room_in_section:
                    break
                continue

            room_no = extract_room_no_from_row(matrix, row)
            if not room_no:
                if has_room_signal:
                    append_row_log(
                        row=row,
                        row_type="noise_row",
                        room_no="",
                        parsed_room_type="",
                        room_type_source="noise",
                        raw_text=raw_text,
                        branch=section_branch,
                    )
                continue

            found_room_in_section = True
            blank_streak = 0
            if is_skip_row_text(room_type_raw):
                append_row_log(
                    row=row,
                    row_type="noise_row",
                    room_no=room_no,
                    parsed_room_type="",
                    room_type_source="noise",
                    raw_text=raw_text,
                    branch=section_branch,
                )
                continue
            if not ROOM_NO_RE.search(room_no):
                append_row_log(
                    row=row,
                    row_type="noise_row",
                    room_no=room_no,
                    parsed_room_type="",
                    room_type_source="noise",
                    raw_text=raw_text,
                    branch=section_branch,
                )
                continue

            explicit_room_type = ""
            for key in room_no_alias_keys(room_no):
                mapped = ROOM_TYPE_BY_ROOM_NO.get(normalize_room_no_key(key))
                if mapped:
                    explicit_room_type = mapped
                    break

            inferred_room_type = infer_room_type_from_label(room_type_raw) or infer_room_type_from_label(
                current_room_type
            )

            # When fixed room map is missing (new branches/renumbered rooms), keep operational rows
            # only if date area has room-like reservation signals.
            if not explicit_room_type and not inferred_room_type and not has_room_signal:
                append_row_log(
                    row=row,
                    row_type="noise_row",
                    room_no=room_no,
                    parsed_room_type="",
                    room_type_source="noise",
                    raw_text=raw_text,
                    branch=section_branch,
                )
                continue

            room_type = explicit_room_type or inferred_room_type or "UNKNOWN_ROOM_TYPE"
            if explicit_room_type:
                room_type_source = "explicit"
            elif inferred_room_type:
                room_type_source = "inferred"
            else:
                room_type_source = "unknown"
            room_type_norm = room_type.upper()
            capacity = ROOM_CAPACITY_BY_TYPE.get(room_type_norm)
            identity = build_room_identity(section_branch, room_no)
            room_rows[row] = RoomRow(
                row=row,
                room_type=room_type,
                room_no=room_no,
                capacity=capacity,
                branch=identity.branch,
                building=identity.building,
                room_number=identity.room_number,
                sheet_room_no=identity.sheet_room_no,
                canonical_id=identity.canonical_id,
                pms_room_no=identity.pms_room_no,
                room_type_source=room_type_source,
                raw_text=raw_text,
            )
            append_row_log(
                row=row,
                row_type="room_row",
                room_no=room_no,
                parsed_room_type=room_type,
                room_type_source=room_type_source,
                raw_text=raw_text,
                branch=identity.branch,
                building=identity.building,
                room_number=identity.room_number,
                sheet_room_no=identity.sheet_room_no,
                canonical_id=identity.canonical_id,
                pms_room_no=identity.pms_room_no,
            )

    if not room_rows:
        raise AuditError("No room rows found from sheet scan.")
    return room_rows

def extract_reservation_blocks(
    matrix: SheetMatrix,
    date_cols: List[DateColumn],
    room_rows: Dict[int, RoomRow],
) -> Tuple[List[ReservationBlock], Dict[str, Any]]:
    sorted_date_cols = sorted(date_cols, key=lambda x: x.col)
    date_by_col = {d.col: d.date for d in sorted_date_cols}
    note_cache: Dict[str, Dict[str, Any]] = {}
    branch_markers = detect_branch_markers(matrix, matrix.start_row, matrix.max_row)
    resolve_row_branch = build_row_branch_resolver(branch_markers)
    uses_room_section_branch = any(normalize_text(room.branch) for room in room_rows.values())
    if uses_room_section_branch:
        branch_assignment_mode = "room_section_anchor"
    else:
        branch_assignment_mode = "dynamic_markers" if branch_markers else "split_row_fallback"
    branch_room_totals = Counter(
        normalize_text(room.branch) or resolve_row_branch(row)
        for row, room in room_rows.items()
    )
    total_rooms_detected = len(room_rows)
    blocks: List[ReservationBlock] = []
    long_tail_candidates: List[Dict[str, Any]] = []
    long_tail_seen: set[Tuple[int, int, str, str]] = set()
    long_tail_counts: Counter[str] = Counter()
    branch_segments: Dict[str, Dict[str, int]] = {}
    for row_index in sorted(room_rows.keys()):
        branch_key = normalize_text(room_rows[row_index].branch) or resolve_row_branch(row_index)
        seg = branch_segments.setdefault(
            branch_key,
            {
                "branch": branch_key,
                "start_row": row_index,
                "end_row": row_index,
                "room_count": 0,
            },
        )
        seg["start_row"] = min(seg["start_row"], row_index)
        seg["end_row"] = max(seg["end_row"], row_index)
        seg["room_count"] += 1

    daily_counters: Dict[dt.date, Dict[str, Dict[str, int]]] = {}
    branch_keys = sort_branch_keys(branch_room_totals.keys())
    if not branch_keys:
        branch_keys = [BRANCH_GANGNAM, BRANCH_COEX]
    for dc in sorted_date_cols:
        per_branch: Dict[str, Dict[str, int]] = {
            "ALL": {"occupied": 0, "blocked": 0, "unknown": 0}
        }
        for branch_key in branch_keys:
            per_branch[branch_key] = {"occupied": 0, "blocked": 0, "unknown": 0}
        daily_counters[dc.date] = per_branch

    error_counts = Counter()
    error_rows: List[Dict[str, Any]] = []

    def add_error(
        code: str,
        row: Optional[int],
        col: Optional[int],
        date_val: Optional[dt.date],
        detail: str,
    ) -> None:
        error_counts[code] += 1
        if len(error_rows) >= 500:
            return
        error_rows.append(
            {
                "code": code,
                "row": (int(row) + 1) if isinstance(row, int) and row >= 0 else None,
                "col": (int(col) + 1) if isinstance(col, int) and col >= 0 else None,
                "date": date_val.isoformat() if date_val else None,
                "detail": detail,
            }
        )

    def parsed_note_identity(note: str) -> Dict[str, Any]:
        key = note or ""
        if key not in note_cache:
            note_cache[key] = parse_reservation_identity(key)
        return note_cache[key]

    def increment_day_count(date_val: dt.date, branch: str, key: str) -> None:
        if date_val not in daily_counters:
            return
        daily_counters[date_val]["ALL"][key] += 1
        if branch not in daily_counters[date_val]:
            daily_counters[date_val][branch] = {"occupied": 0, "blocked": 0, "unknown": 0}
        daily_counters[date_val][branch][key] += 1

    def add_long_tail_candidate(
        *,
        reason: str,
        row: int,
        col: int,
        date_val: dt.date,
        branch: str,
        room_no: str,
        status: str,
        channel: str,
        color_hex: str,
        formatted_value: str,
        note: str,
    ) -> None:
        candidate_channel = infer_candidate_channel_from_cell(formatted_value, note)
        dedupe_key = (int(row), int(col), normalize_text(reason), normalize_text(candidate_channel))
        if dedupe_key in long_tail_seen:
            return
        long_tail_seen.add(dedupe_key)
        long_tail_counts[f"{normalize_text(reason)}::{candidate_channel or 'NONE'}"] += 1
        if len(long_tail_candidates) >= 800:
            return
        long_tail_candidates.append(
            {
                "reason": normalize_text(reason),
                "row": int(row) + 1,
                "col": int(col) + 1,
                "date": date_val.isoformat() if date_val else "",
                "branch": normalize_text(branch),
                "room_no": normalize_text(room_no),
                "status": normalize_text(status),
                "channel": normalize_text(channel),
                "candidate_channel": normalize_text(candidate_channel),
                "color_hex": normalize_text(color_hex).lower(),
                "formatted_value": normalize_text(formatted_value)[:120],
                "note_head": " ".join(normalize_text(note).split(" ")[:24]),
            }
        )

    def flush_run(run: Optional[Dict[str, Any]]) -> None:
        if not run:
            return
        room = room_rows[run["row"]]
        start_col = int(run["start_col"])
        end_col = int(run["end_col"])
        source_columns = list(run["source_columns"])
        checkin = date_by_col.get(start_col)
        if not checkin:
            return
        nights = len(source_columns)
        if nights <= 0:
            return
        checkout = checkin + dt.timedelta(days=nights)
        note_info = parse_note_info(run["note"])
        blocks.append(
            ReservationBlock(
                row=run["row"],
                room_type=room.room_type,
                room_no=room.room_no,
                start_col=start_col,
                end_col=end_col,
                checkin=checkin,
                checkout=checkout,
                nights=nights,
                price=parse_money_to_int(matrix.get(run["row"], start_col).formatted_value),
                note=run["note"],
                reservation_no=run["reservation_no"],
                reservation_key=run["reservation_key"],
                branch=run["branch"],
                channel=run["channel"],
                platform=run["channel"],
                color_hex=run["color_hex"],
                source_columns=source_columns,
                nationality_nights=normalize_text(note_info.nationality_nights),
            )
        )

    for row in sorted(room_rows.keys()):
        room_info = room_rows[row]
        branch = normalize_text(room_info.branch) or resolve_row_branch(row)
        room_no = room_info.room_no
        current_run: Optional[Dict[str, Any]] = None
        for dc in sorted_date_cols:
            col = dc.col
            date_val = dc.date
            cell = matrix.get(row, col)
            status, channel, color_error = classify_color_cell(
                cell.background_hex,
                note=cell.note,
                formatted_value=cell.formatted_value,
            )
            if color_error:
                fallback_tag = ""
                if status == CELL_STATUS_OCCUPIED and channel == "UNKNOWN":
                    fallback_tag = " (fallback-occupied)"
                elif status == CELL_STATUS_BLOCKED:
                    fallback_tag = " (fallback-blocked)"
                add_error(
                    "UNKNOWN_COLOR",
                    row,
                    col,
                    date_val,
                    f"color={normalize_text(cell.background_hex)}{fallback_tag}",
                )
                increment_day_count(date_val, branch, "unknown")
                add_long_tail_candidate(
                    reason="UNKNOWN_COLOR",
                    row=row,
                    col=col,
                    date_val=date_val,
                    branch=branch,
                    room_no=room_no,
                    status=status,
                    channel=channel,
                    color_hex=cell.background_hex or "",
                    formatted_value=cell.formatted_value,
                    note=cell.note,
                )

            reservation_no: Optional[str] = None
            reservation_key: Optional[str] = None
            note_text = cell.note or ""

            if status == CELL_STATUS_OCCUPIED:
                if not normalize_text(note_text):
                    add_error(
                        "NOTEKEY_MISSING_IN_OCCUPIED",
                        row,
                        col,
                        date_val,
                        "occupied cell has empty note",
                    )
                note_data = parsed_note_identity(note_text)
                reservation_no = note_data["reservation_no"]
                reservation_key = note_data["reservation_key"]
                if note_data["note_parse_fail"]:
                    add_error(
                        "NOTE_PARSE_FAIL",
                        row,
                        col,
                        date_val,
                        "failed to build reservation key from note",
                    )
                if note_data.get("used_raw_note_fallback"):
                    add_error(
                        "NOTEKEY_FALLBACK_RAW_NOTE",
                        row,
                        col,
                        date_val,
                        "used hashed raw note fallback key",
                    )
                if not reservation_key:
                    add_error(
                        "NOTEKEY_MISSING_IN_OCCUPIED",
                        row,
                        col,
                        date_val,
                        "reservation key missing",
                    )
                else:
                    increment_day_count(date_val, branch, "occupied")
                if channel in ("", "UNKNOWN"):
                    add_long_tail_candidate(
                        reason="OCCUPIED_UNKNOWN_CHANNEL",
                        row=row,
                        col=col,
                        date_val=date_val,
                        branch=branch,
                        room_no=room_no,
                        status=status,
                        channel=channel,
                        color_hex=cell.background_hex or "",
                        formatted_value=cell.formatted_value,
                        note=cell.note,
                    )
                elif channel == "ETC":
                    add_long_tail_candidate(
                        reason="ETC_CHANNEL",
                        row=row,
                        col=col,
                        date_val=date_val,
                        branch=branch,
                        room_no=room_no,
                        status=status,
                        channel=channel,
                        color_hex=cell.background_hex or "",
                        formatted_value=cell.formatted_value,
                        note=cell.note,
                    )
            elif status == CELL_STATUS_BLOCKED:
                increment_day_count(date_val, branch, "blocked")

            if status == CELL_STATUS_OCCUPIED and reservation_key:
                if (
                    current_run
                    and current_run["reservation_key"] == reservation_key
                    and current_run["row"] == row
                ):
                    current_run["end_col"] = col
                    current_run["source_columns"].append(col)
                    if not current_run["reservation_no"] and reservation_no:
                        current_run["reservation_no"] = reservation_no
                    if not current_run["channel"] and channel:
                        current_run["channel"] = channel
                else:
                    flush_run(current_run)
                    current_run = {
                        "row": row,
                        "branch": branch,
                        "start_col": col,
                        "end_col": col,
                        "source_columns": [col],
                        "reservation_no": reservation_no,
                        "reservation_key": reservation_key,
                        "channel": channel,
                        "note": note_text,
                        "color_hex": cell.background_hex,
                    }
            else:
                flush_run(current_run)
                current_run = None
        flush_run(current_run)

    blocks.sort(key=lambda b: (b.row, b.start_col, b.end_col))
    annotate_group_parts(blocks)

    if total_rooms_detected <= 0:
        add_error(
            "ROOM_COUNT_MISMATCH",
            None,
            None,
            None,
            f"detected={total_rooms_detected}, expected={TOTAL_ROOMS_EXPECTED}",
        )
    elif total_rooms_detected != TOTAL_ROOMS_EXPECTED:
        add_error(
            "ROOM_COUNT_DRIFT",
            None,
            None,
            None,
            f"detected={total_rooms_detected}, baseline={TOTAL_ROOMS_EXPECTED}",
        )

    def to_daily_stat(
        date_val: dt.date,
        weekday: str,
        branch_key: str,
        occupied: int,
        blocked: int,
        unknown: int,
        total_rooms: int,
    ) -> DailyStat:
        vacant = max(total_rooms - occupied - blocked, 0)
        sold = max(occupied + blocked, 0)
        return DailyStat(
            date=date_val,
            weekday=weekday,
            branch=branch_key,
            occupied=occupied,
            blocked=blocked,
            vacant=vacant,
            total_rooms=total_rooms,
            vac=vacant,
            vip=0,
            marketing=0,
            ooo=blocked,
            sold=sold,
            unknown_or_other=unknown,
        )

    daily_all: List[DailyStat] = []
    daily_by_branch: List[DailyStat] = []
    for dc in sorted_date_cols:
        date_val = dc.date
        weekday = dc.weekday_label
        all_row = daily_counters[date_val]["ALL"]
        daily_all.append(
            to_daily_stat(
                date_val=date_val,
                weekday=weekday,
                branch_key="ALL",
                occupied=int(all_row["occupied"]),
                blocked=int(all_row["blocked"]),
                unknown=int(all_row["unknown"]),
                total_rooms=total_rooms_detected,
            )
        )
        for branch_key in branch_keys:
            row = daily_counters[date_val][branch_key]
            branch_total = int(branch_room_totals.get(branch_key, 0))
            daily_by_branch.append(
                to_daily_stat(
                    date_val=date_val,
                    weekday=weekday,
                    branch_key=branch_key,
                    occupied=int(row["occupied"]),
                    blocked=int(row["blocked"]),
                    unknown=int(row["unknown"]),
                    total_rooms=branch_total,
                )
            )

    branch_markers_out = [
        {
            "row": int(item.get("row", 0)) + 1,
            "branch": normalize_text(item.get("branch", "")),
            "label": normalize_text(item.get("label", "")),
        }
        for item in branch_markers
    ]
    branch_segments_out = [
        {
            "branch": normalize_text(value.get("branch", "")),
            "start_row": int(value.get("start_row", 0)) + 1,
            "end_row": int(value.get("end_row", 0)) + 1,
            "room_count": int(value.get("room_count", 0)),
        }
        for value in sorted(
            branch_segments.values(),
            key=lambda item: (PREFERRED_BRANCH_ORDER.get(normalize_text(item.get("branch", "")), 99), item.get("start_row", 0)),
        )
    ]

    return blocks, {
        "daily_all": daily_all,
        "daily_by_branch": daily_by_branch,
        "error_counts": dict(error_counts),
        "errors": error_rows,
        "long_tail_ota_candidates": long_tail_candidates,
        "long_tail_ota_counts": dict(long_tail_counts),
        "branch_assignment_mode": branch_assignment_mode,
        "branch_keys": branch_keys,
        "branch_markers": branch_markers_out,
        "branch_segments": branch_segments_out,
        "branch_room_totals": dict(branch_room_totals),
        "total_rooms_detected": total_rooms_detected,
        "total_rooms_expected": TOTAL_ROOMS_EXPECTED,
        "chunk_mode_enabled": False,
    }


def annotate_group_parts(blocks: List[ReservationBlock]) -> None:
    grouped: Dict[Tuple[int, str], List[ReservationBlock]] = defaultdict(list)
    for block in blocks:
        key = (block.row, reservation_group_key(block))
        block.group_key = key[1]
        grouped[key].append(block)
    for group_blocks in grouped.values():
        group_blocks.sort(key=lambda b: (b.checkin or dt.date.min, b.start_col))
        total = len(group_blocks)
        month_split = any(
            group_blocks[i].checkin
            and group_blocks[i - 1].checkout
            and group_blocks[i].checkin == group_blocks[i - 1].checkout
            and group_blocks[i].checkin.month
            != (group_blocks[i - 1].checkin or group_blocks[i].checkin).month
            for i in range(1, total)
        )
        for idx, block in enumerate(group_blocks, start=1):
            block.part_index = idx
            block.parts_total = total
            block.month_split = month_split


def calculate_daily_stats(
    matrix: SheetMatrix, date_cols: List[DateColumn], room_rows: Dict[int, RoomRow]
) -> List[DailyStat]:
    results: List[DailyStat] = []
    total_rooms = len(room_rows)
    for date_col in date_cols:
        occupied = 0
        blocked = 0
        unknown = 0
        for row in room_rows:
            cell = matrix.get(row, date_col.col)
            status, _channel, error_code = classify_color_cell(
                cell.background_hex,
                note=cell.note,
                formatted_value=cell.formatted_value,
            )
            if status == CELL_STATUS_OCCUPIED:
                occupied += 1
            elif status == CELL_STATUS_BLOCKED:
                blocked += 1
            elif error_code:
                unknown += 1
        vacant = max(total_rooms - occupied - blocked, 0)
        sold = max(occupied + blocked, 0)
        results.append(
            DailyStat(
                date=date_col.date,
                weekday=date_col.weekday_label,
                branch="ALL",
                occupied=occupied,
                blocked=blocked,
                vacant=vacant,
                total_rooms=total_rooms,
                vac=vacant,
                vip=0,
                marketing=0,
                ooo=blocked,
                sold=sold,
                unknown_or_other=unknown,
            )
        )
    return results


def calculate_vac_by_room_type(
    matrix: SheetMatrix, date_cols: List[DateColumn], room_rows: Dict[int, RoomRow]
) -> Dict[Tuple[dt.date, str], int]:
    result: Dict[Tuple[dt.date, str], int] = defaultdict(int)
    for date_col in date_cols:
        for row, room in room_rows.items():
            cell = matrix.get(row, date_col.col)
            status, _channel, _error = classify_color_cell(
                cell.background_hex,
                note=cell.note,
                formatted_value=cell.formatted_value,
            )
            if status == CELL_STATUS_VACANT:
                result[(date_col.date, room.room_type)] += 1
    return result


def find_inventory_rows(matrix: SheetMatrix, row_start: int) -> Dict[str, int]:
    found: Dict[str, int] = {}
    for row in matrix.iter_rows(row_start, matrix.max_row):
        tokens = [
            normalize_text(matrix.get(row, 0).formatted_value),
            normalize_text(matrix.get(row, 1).formatted_value),
            normalize_text(matrix.get(row, 2).formatted_value),
            normalize_text(matrix.get(row, 3).formatted_value),
        ]
        joined = " ".join(t for t in tokens if t).strip()
        provider = resolve_provider_alias(joined)
        if provider and provider not in found:
            found[provider] = row
    return found

def extract_inventory_values_by_date(
    matrix: SheetMatrix, row: int, date_cols: List[DateColumn]
) -> Dict[dt.date, InventoryValue]:
    out: Dict[dt.date, InventoryValue] = {}
    for dc in date_cols:
        raw = matrix.get(row, dc.col).formatted_value
        out[dc.date] = parse_stock_value(raw)
    return out


def calculate_channel_recommendations(
    daily_stats: List[DailyStat],
    station_existing: Optional[Dict[dt.date, InventoryValue]],
    naver_existing: Optional[Dict[dt.date, InventoryValue]],
    vac_share_limit: int,
) -> List[Dict[str, Any]]:
    recommendations: List[Dict[str, Any]] = []
    station_existing = station_existing or {}
    naver_existing = naver_existing or {}

    for stat in daily_stats:
        station_cell = station_existing.get(stat.date, InventoryValue("", None, None))
        naver_cell = naver_existing.get(stat.date, InventoryValue("", None, None))
        full = stat.sold >= stat.total_rooms

        naver_base_max = 3 if stat.date.weekday() in (4, 5) else 4
        naver_max = min(naver_base_max, max(stat.vac, 0))
        station_base_max = 1
        station_max = station_base_max
        if (
            stat.vac >= 7
            and station_cell.maximum is not None
            and station_cell.maximum > 1
        ):
            station_max = station_cell.maximum
        vac_basis = min(stat.vac, vac_share_limit) if vac_share_limit > 0 else stat.vac

        station_irregular = (
            station_cell.maximum is not None
            and station_cell.maximum not in (0, 1)
            and not (stat.vac >= 7 and station_cell.maximum > 1)
        )
        station_reco: Optional[int]
        naver_reco: Optional[int]
        reason: str

        if full:
            station_reco = 0
            naver_reco = 0
            reason = "FULL(n==m)"
        elif station_irregular:
            station_reco = None
            used_station = station_cell.current if station_cell.current is not None else 0
            remain = max(vac_basis - used_station, 0)
            naver_reco = min(naver_max, remain)
            reason = "STATION_IRREGULAR_EXCLUDED"
        else:
            station_reco = min(station_max, vac_basis) if vac_basis > 0 else 0
            station_reco = min(station_reco, station_max)
            remain = max(vac_basis - station_reco, 0)
            naver_reco = min(naver_max, remain)
            reason = "AUTO"

        recommendations.append(
            {
                "date": stat.date.isoformat(),
                "weekday": stat.weekday,
                "vac": stat.vac,
                "vac_basis": vac_basis,
                "sold": stat.sold,
                "total_rooms": stat.total_rooms,
                "station_existing": station_cell.raw,
                "station_max": station_max,
                "station_irregular": station_irregular,
                "station_recommended": station_reco,
                "naver_existing": naver_cell.raw,
                "naver_max": naver_max,
                "naver_recommended": naver_reco,
                "reason": reason,
            }
        )
    return recommendations

