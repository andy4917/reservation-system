from __future__ import annotations

import dataclasses
import datetime as dt
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse

from src.domain.sync_policy import (
    POLICY_GOOGLE_CLIENT_ID,
    POLICY_GOOGLE_SCOPE,
    POLICY_PKCE_FILE,
    POLICY_REDIRECT_URI,
    POLICY_SHEET_GID,
    POLICY_SHEET_NAME,
    POLICY_SPREADSHEET_ID,
    POLICY_START_ROW,
    POLICY_TOKEN_FILE,
    NOTE_CHANNEL_PREFIX_ENABLED,
    NOTE_CHANNEL_PREFIX_TEMPLATE,
    ROOM_TYPE_BY_ROOM_NO as POLICY_ROOM_TYPE_BY_ROOM_NO,
)

DEFAULT_SHEET_ID = POLICY_SPREADSHEET_ID
DEFAULT_SHEET_NAME = POLICY_SHEET_NAME
DEFAULT_SHEET_GID = POLICY_SHEET_GID
DEFAULT_START_ROW = POLICY_START_ROW
DEFAULT_CLIENT_ID = POLICY_GOOGLE_CLIENT_ID
DEFAULT_SCOPE = POLICY_GOOGLE_SCOPE
DEFAULT_REDIRECT_URI = POLICY_REDIRECT_URI
DEFAULT_TOKEN_FILE = POLICY_TOKEN_FILE
DEFAULT_PKCE_FILE = POLICY_PKCE_FILE

BRANCH_SPLIT_ROW = 60
BRANCH_GANGNAM = "GANGNAM"
BRANCH_COEX = "COEX"

CELL_STATUS_OCCUPIED = "OCCUPIED"
CELL_STATUS_BLOCKED = "BLOCKED"
CELL_STATUS_VACANT = "VACANT"
CELL_STATUS_UNKNOWN = "UNKNOWN"

COLOR_STATUS_CHANNEL_MAP: Dict[str, Dict[str, str]] = {
    "ea9999": {"status": CELL_STATUS_OCCUPIED, "channel": "AGODA"},
    "6d9eeb": {"status": CELL_STATUS_OCCUPIED, "channel": "BOOKING"},
    "45818e": {"status": CELL_STATUS_OCCUPIED, "channel": "TRIP"},
    "b6d7a8": {"status": CELL_STATUS_OCCUPIED, "channel": "AIRBNB"},
    "c9daf8": {"status": CELL_STATUS_OCCUPIED, "channel": "TRAVELOKA"},
    "6aa84f": {"status": CELL_STATUS_OCCUPIED, "channel": "NAVER"},
    "34a853": {"status": CELL_STATUS_OCCUPIED, "channel": "NAVER"},
    "ffff00": {"status": CELL_STATUS_OCCUPIED, "channel": "YANOLJA"},
    "ead1dc": {"status": CELL_STATUS_OCCUPIED, "channel": "HERE"},
    "980000": {"status": CELL_STATUS_OCCUPIED, "channel": "COUPANG_TRAVEL"},
    "00ffff": {"status": CELL_STATUS_OCCUPIED, "channel": "STATION"},
    "8e7cc3": {"status": CELL_STATUS_OCCUPIED, "channel": "DIDA_TRAVEL"},
    "999999": {"status": CELL_STATUS_OCCUPIED, "channel": "ETC"},
    "f6b26b": {"status": CELL_STATUS_OCCUPIED, "channel": "UNKNOWN"},
    "00ff00": {"status": CELL_STATUS_BLOCKED, "channel": "VIP"},
    "000000": {"status": CELL_STATUS_BLOCKED, "channel": "OOO"},
    "073763": {"status": CELL_STATUS_BLOCKED, "channel": "MARKETING"},
    "ffffff": {"status": CELL_STATUS_VACANT, "channel": "VAC"},
}
IGNORED_COLOR_HEX = {"3d85c6", "f3f3f3"}

TOTAL_ROOMS_EXPECTED = 41
GRID_FETCH_END_COL_OPTIMIZED = "NZ"
GRID_FETCH_END_COL_FULL = "ZZ"

PLATFORM_ALIASES: Dict[str, str] = {
    "NAVER": "NAVER",
    "\ub124\uc774\ubc84": "NAVER",
    "STATION": "STATION",
    "\uc2a4\ud14c\uc774\uc158": "STATION",
    "UH SUITE": "STATION",
    "UHSUITE": "STATION",
    "AGODA": "AGODA",
    "\uc544\uace0\ub2e4": "AGODA",
    "BOOKING": "BOOKING",
    "BOOKING.COM": "BOOKING",
    "\ubd80\ud0b9": "BOOKING",
    "\ubd80\ud0b9\ub2f7\ucef4": "BOOKING",
    "TRIP": "TRIP",
    "TRIP.COM": "TRIP",
    "CTRIP": "TRIP",
    "\ud2b8\ub9bd": "TRIP",
    "\ud2b8\ub9bd\ub2f7\ucef4": "TRIP",
    "EXPEDIA": "EXPEDIA",
    "\uc775\uc2a4\ud53c\ub514\uc544": "EXPEDIA",
    "EXPEDIA_AIRBNB": "EXPEDIA",
    "AIRBNB": "AIRBNB",
    "AIR BNB": "AIRBNB",
    "\uc5d0\uc5b4\ube44\uc564\ube44": "AIRBNB",
    "\uc5d0\uc5b4\ube44\uc5d4\ube44": "AIRBNB",
    "TRAVELOKA": "TRAVELOKA",
    "YANOLJA": "YANOLJA",
    "\uc57c\ub180\uc790": "YANOLJA",
    "HERE": "HERE",
    "\uc5ec\uae30\uc5b4\ub54c": "HERE",
    "COUPANG_TRAVEL": "COUPANG_TRAVEL",
    "\ucfe0\ud321\ud2b8\ub798\ube14": "COUPANG_TRAVEL",
    "NOL_INTERPARK": "DIDA_TRAVEL",
    "\ub180\uc778\ud130\ud30c\ud06c": "DIDA_TRAVEL",
    "DIDA_TRAVEL": "DIDA_TRAVEL",
    "\ub514\ub2e4\ud2b8\ub808\ube14": "DIDA_TRAVEL",
    "\ub514\ub2e4\ud2b8\ub798\ube14": "DIDA_TRAVEL",
    "ETC": "ETC",
    "VIP": "VIP",
    "OOO": "OOO",
    "MARKETING": "MARKETING",
    "\ub9c8\ucf00\ud305": "MARKETING",
    "VAC": "VAC",
}

PLATFORM_HINTS: Dict[str, Tuple[str, ...]] = {
    "STATION": ("station", "uhsuite", "\uc2a4\ud14c\uc774\uc158"),
    "NAVER": ("naver", "\ub124\uc774\ubc84"),
    "AGODA": ("agoda", "\uc544\uace0\ub2e4"),
    "BOOKING": ("booking", "booking.com", "\ubd80\ud0b9", "\ubd80\ud0b9\ub2f7\ucef4"),
    "TRIP": ("trip", "trip.com", "ctrip", "\ud2b8\ub9bd", "\ud2b8\ub9bd\ub2f7\ucef4"),
    "AIRBNB": ("airbnb", "air bnb", "\uc5d0\uc5b4\ube44\uc564\ube44", "\uc5d0\uc5b4\ube44\uc5d4\ube44"),
    "EXPEDIA": ("expedia", "\uc775\uc2a4\ud53c\ub514\uc544"),
    "TRAVELOKA": ("traveloka",),
    "YANOLJA": ("yanolja", "\uc57c\ub180\uc790"),
    "HERE": ("here", "\uc5ec\uae30\uc5b4\ub54c"),
    "COUPANG_TRAVEL": ("coupang", "\ucfe0\ud321"),
    "DIDA_TRAVEL": (
        "dida",
        "interpark",
        "\uc778\ud130\ud30c\ud06c",
        "\ub180\uc778\ud130\ud30c\ud06c",
        "\ub514\ub2e4\ud2b8\ub808\ube14",
        "\ub514\ub2e4\ud2b8\ub798\ube14",
    ),
}


def _compact_platform_key(value: Optional[str]) -> str:
    if value is None:
        return ""
    return re.sub(r"[^0-9a-zA-Z\uac00-\ud7a3]", "", str(value).strip().lower())


PLATFORM_ALIASES_COMPACT: Dict[str, str] = {}
for _alias, _canonical in PLATFORM_ALIASES.items():
    _k = _compact_platform_key(_alias)
    if _k:
        PLATFORM_ALIASES_COMPACT[_k] = _canonical
for _canonical in set(PLATFORM_ALIASES.values()):
    _k = _compact_platform_key(_canonical)
    if _k and _k not in PLATFORM_ALIASES_COMPACT:
        PLATFORM_ALIASES_COMPACT[_k] = _canonical

ROOM_CAPACITY_BY_TYPE = {
    "URBAN SPA SUITE": 6,
    "DOUBLE TWIN SPA ROOM": 4,
    "GRAND SPA SUITE 8IN": 8,
}

RES_NO_FIELD_ALIASES = [
    "reservation_no",
    "reservationno",
    "booking_no",
    "bookingno",
    "confirm_no",
    "confirmation_no",
    "reservationnumber",
    "reservationnum",
    "orderno",
    "rsvn_no",
    "global_rsvn_no",
    "guest_rsvn_no",
    "rsvn_seq_no",
    "rsvn_folio_no",
    "\uc608\uc57d\ubc88\ud638",
]
CHECKIN_FIELD_ALIASES = [
    "checkin",
    "check_in",
    "checkindate",
    "arrival_date",
    "arrivaldate",
    "arrv_date",
    "arrvdate",
    "start_date",
    "\uccb4\ud06c\uc778",
    "\uc785\uc2e4",
]
CHECKOUT_FIELD_ALIASES = [
    "checkout",
    "check_out",
    "checkoutdate",
    "departure_date",
    "departuredate",
    "dept_date",
    "deptdate",
    "chck_out_date",
    "chckoutdate",
    "end_date",
    "\uccb4\ud06c\uc544\uc6c3",
    "\ud1f4\uc2e4",
]
CHANNEL_FIELD_ALIASES = [
    "channel",
    "ota",
    "platform",
    "site",
    "vendor",
    "source_code",
    "market_code",
    "ota_channel",
    "account",
    "\ud310\ub9e4\ucc44\ub110\uba85",
    "\uacc4\uc815",
]
NATIONALITY_FIELD_ALIASES = [
    "nationality",
    "guest_nationality",
    "guest_nation",
    "guest_country",
    "nationality_nights",
    "\uad6d\uc801",
    "\uad6d\uc801\ubc0f\ubc15\uc218",
]
NIGHTS_FIELD_ALIASES = ["nights", "night", "stay_nights", "\ubc15\uc218"]
ROOM_FIELD_ALIASES = ["room_no", "roomno", "room_number", "\uac1d\uc2e4", "\uac1d\uc2e4\ubc88\ud638"]
PRICE_FIELD_ALIASES = ["price", "amount", "cost", "room_amt", "rate", "\uc219\ubc15\ube44", "\uc694\uae08"]
ACCOUNT_FIELD_ALIASES = ["account", "acct", "\uacc4\uc815"]
STATUS_FIELD_ALIASES = [
    "status",
    "reservation_status",
    "rsvn_status",
    "rsvn_status_code",
    "booking_status",
    "\uc608\uc57d\uc0c1\ud0dc",
]
BRANCH_FIELD_ALIASES = [
    "branch",
    "branch_name",
    "property_no",
    "property_code",
    "bsns_code",
    "hotel",
    "hotel_name",
    "\uc9c0\uc810",
]

RESERVATION_NUMBER_RE = re.compile(
    r"(?:reservation(?:_|\s*)number|\uc608\uc57d\ubc88\ud638)\s*[:#]?\s*([0-9A-Za-z_-]+)",
    re.IGNORECASE,
)
CHECKIN_CHECKOUT_RE = re.compile(
    r"(\d{4}-\d{2}-\d{2})\s*[-~]\s*(\d{4}-\d{2}-\d{2})"
)
DATE_LABEL_RE = re.compile(r"^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*$")
DATE_LABEL_KO_RE = re.compile(r"^\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*$")
ROOM_NO_RE = re.compile(r"\d")
DATE_HEADER_HINT_ROW = 64  # 1-based row 65
DATE_WEEKDAY_HINT_ROW = 65  # 1-based row 66
DATE_HEADER_HINT_COL = 52  # BA column (0-based)

ROOM_CAPACITY_BY_TYPE.update(
    {
        "URBAN SPA SUITE 6IN": 6,
        "DOUBLE TWIN SPA ROOM 4IN": 4,
        "GRAND SPA SUITE 8IN": 8,
    }
)

ROOM_TYPE_BY_ROOM_NO: Dict[str, str] = {
    re.sub(r"\s+", " ", str(room_no)).strip().upper(): re.sub(r"\s+", " ", str(room_type)).strip()
    for room_no, room_type in POLICY_ROOM_TYPE_BY_ROOM_NO.items()
}


class AuditError(Exception):
    pass


@dataclass
class Cell:
    row: int
    col: int
    formatted_value: str = ""
    note: str = ""
    background_color: Optional[Dict[str, float]] = None
    background_hex: Optional[str] = None
    borders: Optional[Dict[str, Any]] = None


@dataclass
class DateColumn:
    col: int
    date: dt.date
    label: str
    weekday_label: str = ""


@dataclass
class RoomIdentity:
    branch: str
    building: str
    room_number: str
    sheet_room_no: str
    canonical_id: str
    pms_room_no: str


@dataclass
class RoomRow:
    row: int
    room_type: str
    room_no: str
    capacity: Optional[int]
    branch: str = ""
    building: str = ""
    room_number: str = ""
    sheet_room_no: str = ""
    canonical_id: str = ""
    pms_room_no: str = ""
    room_type_source: str = ""
    raw_text: str = ""


@dataclass
class NoteInfo:
    people: Optional[int] = None
    reservation_no: Optional[str] = None
    guest_name: Optional[str] = None
    nationality_nights: Optional[str] = None
    phone: Optional[str] = None
    stay_checkin: Optional[dt.date] = None
    stay_checkout: Optional[dt.date] = None


@dataclass
class ReservationBlock:
    row: int
    room_type: str
    room_no: str
    start_col: int
    end_col: int
    checkin: Optional[dt.date]
    checkout: Optional[dt.date]
    nights: int
    price: Optional[int]
    note: str
    reservation_no: Optional[str]
    reservation_key: Optional[str]
    branch: str
    channel: str
    platform: str
    color_hex: Optional[str] = None
    source_columns: List[int] = dataclasses.field(default_factory=list)
    group_key: str = ""
    part_index: int = 1
    parts_total: int = 1
    month_split: bool = False
    nationality_nights: str = ""


@dataclass
class HarRecord:
    reservation_no: Optional[str]
    ota: str
    ota_normalized: str
    price: Optional[int]
    nights: Optional[int]
    checkin: Optional[dt.date]
    checkout: Optional[dt.date]
    info: str
    raw: Dict[str, Any]


@dataclass
class SourceReservation:
    source_system: str
    reservation_no: str
    channel: str
    checkin: dt.date
    checkout: dt.date
    nights: int
    room_no: str = ""
    price: Optional[int] = None
    account: str = ""
    status: str = ""
    status_bucket: str = ""
    audit_anomaly: bool = False
    branch: str = ""
    reservation_ref: str = ""
    nationality_nights: str = ""
    raw: Dict[str, Any] = dataclasses.field(default_factory=dict)


@dataclass
class InventoryValue:
    raw: str
    current: Optional[int]
    maximum: Optional[int]


@dataclass
class DailyStat:
    date: dt.date
    weekday: str
    branch: str
    occupied: int
    blocked: int
    vacant: int
    total_rooms: int
    vac: int
    vip: int
    marketing: int
    ooo: int
    sold: int
    unknown_or_other: int


def normalize_text(value: Optional[str]) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_room_no_key(value: Optional[str]) -> str:
    return normalize_text(value).upper().replace(" ", "")


def normalize_platform_name(value: Optional[str]) -> str:
    raw = normalize_text(value)
    if not raw:
        return ""
    text = raw.upper()
    direct = PLATFORM_ALIASES.get(text)
    if direct:
        return direct
    compact = _compact_platform_key(raw)
    compact_hit = PLATFORM_ALIASES_COMPACT.get(compact)
    if compact_hit:
        return compact_hit
    best_match: Optional[Tuple[int, int, str]] = None
    for canonical, hints in PLATFORM_HINTS.items():
        for hint in hints:
            hint_key = _compact_platform_key(hint)
            if not hint_key:
                continue
            idx = compact.find(hint_key)
            if idx < 0:
                continue
            score = (idx, -len(hint_key), canonical)
            if best_match is None or score < best_match:
                best_match = score
    if best_match is not None:
        return best_match[2]
    return raw


def build_channel_note_prefix(channel: Optional[str]) -> str:
    if not NOTE_CHANNEL_PREFIX_ENABLED:
        return ""
    normalized = normalize_platform_name(channel)
    if not normalized:
        return ""
    template = normalize_text(NOTE_CHANNEL_PREFIX_TEMPLATE) or "[CHANNEL: {channel}]"
    if "{channel}" not in template:
        template = f"{template} {{channel}}"
    return template.replace("{channel}", normalized)


def ensure_channel_note_prefix(note: Optional[str], channel: Optional[str]) -> str:
    raw_note = str(note or "")
    normalized_note = normalize_text(raw_note)
    prefix = build_channel_note_prefix(channel)
    if not prefix:
        return raw_note
    if normalized_note.upper().startswith(prefix.upper()):
        return raw_note
    return prefix if not normalized_note else f"{prefix} {normalized_note}"


def parse_money_to_int(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    digits = re.sub(r"[^\d-]", "", value)
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def parse_date_label(label: str, year: int) -> Optional[dt.date]:
    text = normalize_text(label)
    m = DATE_LABEL_RE.match(text) or DATE_LABEL_KO_RE.match(text)
    if not m:
        return None
    month = int(m.group(1))
    day = int(m.group(2))
    try:
        return dt.date(year, month, day)
    except ValueError:
        return None


def try_parse_iso_date(value: Optional[str]) -> Optional[dt.date]:
    if not value:
        return None
    try:
        return dt.date.fromisoformat(value.strip())
    except ValueError:
        return None


def normalize_key(value: str) -> str:
    return re.sub(r"[^0-9a-zA-Z\uac00-\ud7a3]", "", str(value).strip().lower())


def infer_channel_from_text(value: str) -> str:
    low = normalize_text(value).lower()
    if not low:
        return ""
    if "uh suite" in low or "station" in low:
        return "STATION"
    if "naver" in low:
        return "NAVER"
    if "wings" in low:
        return "WINGS"
    return normalize_platform_name(value)


def normalize_channel(value: str, source_system: str = "") -> str:
    base = infer_channel_from_text(value)
    if base and base != normalize_text(value):
        return base
    normalized = normalize_platform_name(value)
    if normalized:
        return normalized
    src = normalize_text(source_system).upper()
    if src == "NAVER":
        return "NAVER"
    if src == "STATION":
        return "STATION"
    return "UNKNOWN"


def normalize_reservation_status(value: Optional[str]) -> str:
    text = normalize_text(value).upper()
    if not text:
        return ""
    compact = re.sub(r"[^A-Z0-9]+", "", text)
    if not compact:
        return text
    if "NOSHOW" in compact:
        return "NOSHOW"
    canceled_tokens = (
        "CANCEL",
        "CANCELED",
        "CANCELLED",
        "CNCL",
        "CNX",
        "CXL",
    )
    if any(token in compact for token in canceled_tokens):
        return "CANCELED"
    return compact


def classify_reservation_status_bucket(value: Optional[str]) -> str:
    text = normalize_reservation_status(value)
    if text == "CANCELED":
        return "CANCELED"
    return "ACTIVE"


def has_reservation_audit_anomaly(value: Optional[str]) -> bool:
    text = normalize_reservation_status(value)
    return text in {"NOSHOW", "NS"}


def calculate_checkout_from_dates(
    checkin: Optional[dt.date], checkout: Optional[dt.date], nights: Optional[int]
) -> Tuple[Optional[dt.date], Optional[dt.date], int]:
    if checkin and checkout and checkout > checkin:
        return checkin, checkout, (checkout - checkin).days
    if checkin and nights and nights > 0:
        calc_checkout = checkin + dt.timedelta(days=nights)
        return checkin, calc_checkout, nights
    if checkin:
        calc_checkout = checkin + dt.timedelta(days=1)
        return checkin, calc_checkout, 1
    return None, None, 0


def stay_dates(checkin: dt.date, checkout: dt.date) -> List[dt.date]:
    days: List[dt.date] = []
    cursor = checkin
    while cursor < checkout:
        days.append(cursor)
        cursor += dt.timedelta(days=1)
    return days


def extract_sheet_id(value: str) -> str:
    text = normalize_text(value).replace("\u200b", "").replace("\u200c", "").replace("\u200d", "").replace("\ufeff", "")
    if not text:
        return ""

    def _unquote_wrapped(raw: str) -> str:
        s = normalize_text(raw)
        if len(s) >= 2 and ((s[0] == s[-1] == "\"") or (s[0] == s[-1] == "'")):
            return normalize_text(s[1:-1])
        return s

    text = _unquote_wrapped(text)
    candidates = {text}
    decoded = _unquote_wrapped(unquote(text))
    if decoded:
        candidates.add(decoded)

    maybe_url = ""
    if re.match(r"^[a-z][a-z0-9+.-]*://", text, flags=re.IGNORECASE):
        maybe_url = text
    elif text.lower().startswith("docs.google.com/"):
        maybe_url = f"https://{text}"

    if maybe_url:
        try:
            parsed = urlparse(maybe_url)
            path = _unquote_wrapped(parsed.path or "")
            if path:
                candidates.add(path)
            query_id = _unquote_wrapped((parse_qs(parsed.query).get("id", [""])[0]))
            if query_id:
                candidates.add(query_id)
        except Exception:
            pass

    path_patterns = [
        re.compile(r"/spreadsheets(?:/u/\d+)?/d/([A-Za-z0-9_-]{40,120})", flags=re.IGNORECASE),
        re.compile(r"/d/([A-Za-z0-9_-]{40,120})", flags=re.IGNORECASE),
    ]
    query_id_pattern = re.compile(r"(?:[?&#]|^)id=([A-Za-z0-9_-]{40,120})", flags=re.IGNORECASE)
    strict_id_pattern = re.compile(r"^[A-Za-z0-9_-]{40,120}$")

    for raw in candidates:
        candidate = _unquote_wrapped(raw)
        if not candidate:
            continue
        for pattern in path_patterns:
            m = pattern.search(candidate)
            if m:
                return m.group(1)
        m = query_id_pattern.search(candidate)
        if m:
            return m.group(1)
        leading = re.split(r"[/?#&=]", candidate, maxsplit=1)[0]
        if strict_id_pattern.fullmatch(leading) and re.search(r"[A-Za-z]", leading):
            return leading
        if strict_id_pattern.fullmatch(candidate) and re.search(r"[A-Za-z]", candidate):
            return candidate
    return ""


def infer_year_from_sheet_name(sheet_name: str, fallback: int) -> int:
    m = re.search(r"(20\d{2})", sheet_name)
    if m:
        return int(m.group(1))
    return fallback

