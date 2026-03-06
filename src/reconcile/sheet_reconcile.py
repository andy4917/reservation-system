from __future__ import annotations

import datetime as dt
import re
from collections import defaultdict
from typing import Any, Dict, List, Tuple

from src.domain.sheet_domain import (
    HarRecord,
    ReservationBlock,
    SourceReservation,
    calculate_checkout_from_dates,
    classify_reservation_status_bucket,
    normalize_channel,
    normalize_platform_name,
    normalize_text,
    stay_dates,
)


def aggregate_sheet_reservations(
    blocks: List[ReservationBlock],
) -> Dict[str, Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}
    for block in blocks:
        if not block.reservation_no:
            continue
        g = grouped.setdefault(
            block.reservation_no,
            {
                "reservation_no": block.reservation_no,
                "room_nos": set(),
                "room_types": set(),
                "checkin": block.checkin,
                "checkout": block.checkout,
                "nights": block.nights,
                "platforms": set(),
                "prices": [block.price] if block.price is not None else [],
                "blocks": 0,
            },
        )
        g["blocks"] += 1
        if normalize_text(block.room_no):
            g["room_nos"].add(normalize_text(block.room_no))
        if normalize_text(block.room_type):
            g["room_types"].add(normalize_text(block.room_type))
        g["platforms"].add(block.platform)
        if block.price is not None:
            g["prices"].append(block.price)
        if block.checkin and (g["checkin"] is None or block.checkin < g["checkin"]):
            g["checkin"] = block.checkin
        if block.checkout and (g["checkout"] is None or block.checkout > g["checkout"]):
            g["checkout"] = block.checkout

    for item in grouped.values():
        if item["checkin"] and item["checkout"]:
            item["nights"] = (item["checkout"] - item["checkin"]).days
        item["platforms"] = sorted(item["platforms"])
        item["room_nos"] = sorted(item["room_nos"])
        item["room_types"] = sorted(item["room_types"])
        item["room_no"] = ",".join(item["room_nos"])
        item["room_type"] = ",".join(item["room_types"])
        item["price"] = item["prices"][0] if item["prices"] else None
        item.pop("prices", None)
    return grouped


def summarize_sheet_reservation(sheet: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "room_no": sheet.get("room_no"),
        "room_type": sheet.get("room_type"),
        "checkin": sheet.get("checkin").isoformat() if sheet.get("checkin") else None,
        "checkout": sheet.get("checkout").isoformat() if sheet.get("checkout") else None,
        "nights": sheet.get("nights"),
        "platforms": sheet.get("platforms"),
        "price": sheet.get("price"),
        "blocks": sheet.get("blocks"),
    }


def reconcile_sheet_vs_har(
    blocks: List[ReservationBlock], har_index: Dict[str, HarRecord]
) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    sheet_index = aggregate_sheet_reservations(blocks)

    for reservation_no, sheet in sheet_index.items():
        source = har_index.get(reservation_no)
        if not source:
            issues.append(
                {
                    "type": "MISSING_IN_HAR",
                    "reservation_no": reservation_no,
                    "sheet": summarize_sheet_reservation(sheet),
                    "har": None,
                }
            )
            continue

        sheet_platforms = sheet["platforms"]
        if len(sheet_platforms) == 1:
            sheet_platform = normalize_platform_name(sheet_platforms[0])
            if (
                not sheet_platform.startswith("AMBIGUOUS")
                and not sheet_platform.startswith("UNKNOWN")
                and sheet_platform != source.ota_normalized
            ):
                issues.append(
                    {
                        "type": "PLATFORM_MISMATCH",
                        "reservation_no": reservation_no,
                        "sheet_platform": sheet_platform,
                        "har_platform": source.ota_normalized,
                    }
                )

        if source.price is not None and sheet.get("price") is not None:
            if int(sheet["price"]) != int(source.price):
                issues.append(
                    {
                        "type": "PRICE_MISMATCH",
                        "reservation_no": reservation_no,
                        "sheet_price": sheet["price"],
                        "har_price": source.price,
                    }
                )

        if source.nights is not None and sheet.get("nights") is not None:
            if int(sheet["nights"]) != int(source.nights):
                issues.append(
                    {
                        "type": "NIGHTS_MISMATCH",
                        "reservation_no": reservation_no,
                        "sheet_nights": sheet["nights"],
                        "har_nights": source.nights,
                    }
                )

        if source.checkin and sheet.get("checkin") and source.checkin != sheet["checkin"]:
            issues.append(
                {
                    "type": "CHECKIN_MISMATCH",
                    "reservation_no": reservation_no,
                    "sheet_checkin": sheet["checkin"].isoformat(),
                    "har_checkin": source.checkin.isoformat(),
                }
            )
        if source.checkout and sheet.get("checkout") and source.checkout != sheet["checkout"]:
            issues.append(
                {
                    "type": "CHECKOUT_MISMATCH",
                    "reservation_no": reservation_no,
                    "sheet_checkout": sheet["checkout"].isoformat(),
                    "har_checkout": source.checkout.isoformat(),
                }
            )

    for reservation_no, source in har_index.items():
        if reservation_no not in sheet_index:
            issues.append(
                {
                    "type": "MISSING_IN_SHEET",
                    "reservation_no": reservation_no,
                    "sheet": None,
                    "har": {
                        "ota": source.ota_normalized,
                        "price": source.price,
                        "nights": source.nights,
                        "checkin": source.checkin.isoformat() if source.checkin else None,
                        "checkout": source.checkout.isoformat() if source.checkout else None,
                    },
                }
            )
    return issues


def is_unknown_or_ambiguous_channel(channel: str) -> bool:
    text = normalize_text(channel).upper()
    return (not text) or text.startswith("UNKNOWN") or text.startswith("AMBIGUOUS")


def split_room_tokens(value: str) -> List[str]:
    text = normalize_text(value)
    if not text:
        return []
    out: List[str] = []
    seen: set[str] = set()
    for part in re.split(r"[,;/|]+", text):
        token = normalize_text(part).upper().replace(" ", "").replace("-", "")
        if not token:
            continue
        if token.isdigit():
            token = str(int(token))
        if token in seen:
            continue
        seen.add(token)
        out.append(token)
    return out


def reservation_id_alias_tokens(value: str) -> List[str]:
    text = normalize_text(value)
    if not text:
        return []
    out: List[str] = []
    seen: set[str] = set()

    def push(token: str) -> None:
        normalized = normalize_text(token)
        if not normalized:
            return
        variants = {normalized, normalized.upper()}
        compact = normalized.replace(" ", "")
        if compact:
            variants.add(compact)
            variants.add(compact.upper())
        for variant in variants:
            min_len = 4 if variant.isdigit() else 6
            if len(variant) < min_len:
                continue
            if variant not in seen:
                seen.add(variant)
                out.append(variant)
            for digits in re.findall(r"\d{4,}", variant):
                if digits in seen:
                    continue
                seen.add(digits)
                out.append(digits)

    push(text)
    for token in re.split(r"[-_/|]+", text):
        push(token)
    return out


def build_source_reservation_alias_index(
    records: List[SourceReservation],
) -> Tuple[Dict[str, str], Dict[str, List[str]]]:
    alias_to_primary: Dict[str, str] = {}
    primary_to_aliases: Dict[str, set[str]] = defaultdict(set)
    collisions: set[str] = set()

    for record in records:
        primary = normalize_text(record.reservation_no)
        if not primary:
            continue
        aliases = set(reservation_id_alias_tokens(primary))
        aliases.update(reservation_id_alias_tokens(record.reservation_ref))
        aliases.add(primary)
        primary_to_aliases[primary].update(aliases)
        for alias in aliases:
            prev = alias_to_primary.get(alias)
            if prev and prev != primary:
                collisions.add(alias)
                continue
            alias_to_primary[alias] = primary

    for alias in collisions:
        alias_to_primary.pop(alias, None)
        for aliases in primary_to_aliases.values():
            aliases.discard(alias)

    return alias_to_primary, {
        primary: sorted(values)
        for primary, values in primary_to_aliases.items()
    }


def room_alias_keys(room_no: str) -> set[str]:
    token = normalize_text(room_no).upper().replace(" ", "").replace("-", "")
    if not token:
        return set()
    out: set[str] = set()
    if re.fullmatch(r"\d{1,5}", token):
        n = int(token)
        out.add(str(n))
        out.add(f"B{n}")
        if n >= 1301:
            out.add(f"A{n - 1000}")
        return out
    if re.fullmatch(r"A\d{3,4}", token):
        n = int(token[1:])
        out.add(token)
        out.add(str(n + 1000))
        return out
    if re.fullmatch(r"B\d{3,4}", token):
        n = int(token[1:])
        out.add(token)
        out.add(str(n))
        return out
    out.add(token)
    return out


def room_alias_union(room_nos: set[str]) -> set[str]:
    merged: set[str] = set()
    for room in room_nos:
        merged.update(room_alias_keys(room))
    return merged


def room_sets_conflict(sheet_rooms: set[str], source_rooms: set[str]) -> bool:
    if not sheet_rooms or not source_rooms:
        return False
    sheet_alias = room_alias_union(sheet_rooms)
    source_alias = room_alias_union(source_rooms)
    if not sheet_alias or not source_alias:
        return False
    return sheet_alias.isdisjoint(source_alias)


def unmatched_room_tokens(left_rooms: set[str], right_rooms: set[str]) -> List[str]:
    if not left_rooms:
        return []
    right_alias = room_alias_union(right_rooms)
    out: List[str] = []
    for room in sorted(left_rooms):
        room_alias = room_alias_keys(room)
        if room_alias and room_alias.isdisjoint(right_alias):
            out.append(room)
    return out


def unmatched_known_tokens(left_values: set[str], right_values: set[str]) -> List[str]:
    right_normalized = {
        normalize_text(value).upper()
        for value in right_values
        if normalize_text(value)
    }
    out: List[str] = []
    for value in sorted(left_values):
        token = normalize_text(value).upper()
        if not token:
            continue
        if token not in right_normalized:
            out.append(token)
    return out


def is_inactive_source_status(status: str) -> bool:
    return classify_reservation_status_bucket(status) == "CANCELED"


def is_commission_adjusted_price_match(
    sheet_price: int,
    source_price: int,
    source_channels: set[str],
) -> bool:
    if source_price <= 0 or sheet_price <= 0:
        return False
    ratio = float(sheet_price) / float(source_price)
    normalized_channels = {normalize_text(ch).upper() for ch in source_channels if normalize_text(ch)}
    if normalized_channels == {"BOOKING"}:
        # BOOKING prices are often stored net of commission in the sheet.
        return abs(ratio - 0.825) <= 0.005
    if normalized_channels == {"EXPEDIA"}:
        # EXPEDIA final settlement can vary by reservation-level commission/tax policy.
        # Treat price gap as non-actionable for cross-validation.
        return True
    return False


def build_sheet_reservation_events(
    blocks: List[ReservationBlock],
) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    for block in blocks:
        if not block.reservation_no:
            continue
        if not block.checkin:
            continue
        checkin, checkout, _nights = calculate_checkout_from_dates(
            block.checkin, block.checkout, block.nights
        )
        if not checkin or not checkout:
            continue
        for d in stay_dates(checkin, checkout):
            events.append(
                {
                    "reservation_no": block.reservation_no,
                    "date": d,
                    "channel": normalize_channel(block.platform),
                    "room_no": block.room_no,
                    "room_type": block.room_type,
                }
            )
    deduped = {}
    for e in events:
        key = (e["reservation_no"], e["date"], e["channel"], e["room_no"])
        deduped[key] = e
    return list(deduped.values())


def build_source_reservation_events(
    records: List[SourceReservation],
) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    for record in records:
        if is_inactive_source_status(record.status):
            continue
        room_tokens = split_room_tokens(record.room_no) or [""]
        for d in stay_dates(record.checkin, record.checkout):
            for room_no in room_tokens:
                events.append(
                    {
                        "reservation_no": record.reservation_no,
                        "date": d,
                        "channel": normalize_channel(record.channel, record.source_system),
                        "source_system": record.source_system,
                        "room_no": room_no,
                        "status": normalize_text(record.status).upper(),
                    }
                )
    deduped = {}
    for e in events:
        key = (
            e["reservation_no"],
            e["date"],
            e["channel"],
            e["source_system"],
            e["room_no"],
        )
        deduped[key] = e
    return list(deduped.values())


def build_sheet_room_date_counts(
    blocks: List[ReservationBlock],
) -> Dict[Tuple[str, dt.date, str], int]:
    counts: Dict[Tuple[str, dt.date, str], int] = defaultdict(int)
    for block in blocks:
        reservation_no = normalize_text(block.reservation_no)
        room_no = normalize_text(block.room_no)
        if not reservation_no or not room_no:
            continue
        checkin, checkout, _nights = calculate_checkout_from_dates(
            block.checkin, block.checkout, block.nights
        )
        if not checkin or not checkout:
            continue
        for date_val in stay_dates(checkin, checkout):
            counts[(reservation_no, date_val, room_no)] += 1
    return counts


def aggregate_source_reservations(
    records: List[SourceReservation],
) -> Dict[str, Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}
    for record in records:
        g = grouped.setdefault(
            record.reservation_no,
            {
                "reservation_no": record.reservation_no,
                "checkin": record.checkin,
                "checkout": record.checkout,
                "nights": record.nights,
                "channels": set(),
                "room_nos": set(),
                "prices": [],
                "systems": set(),
                "statuses": set(),
                "status_buckets": set(),
                "audit_anomaly": False,
            },
        )
        if record.checkin and (g["checkin"] is None or record.checkin < g["checkin"]):
            g["checkin"] = record.checkin
        if record.checkout and (g["checkout"] is None or record.checkout > g["checkout"]):
            g["checkout"] = record.checkout
        g["channels"].add(normalize_channel(record.channel, record.source_system))
        g["systems"].add(normalize_text(record.source_system).upper())
        if normalize_text(record.status):
            g["statuses"].add(normalize_text(record.status).upper())
        if normalize_text(record.status_bucket):
            g["status_buckets"].add(normalize_text(record.status_bucket).upper())
        if record.audit_anomaly:
            g["audit_anomaly"] = True
        for room_token in split_room_tokens(record.room_no):
            g["room_nos"].add(room_token)
        if record.price is not None:
            g["prices"].append(int(record.price))

    for item in grouped.values():
        if item["checkin"] and item["checkout"]:
            item["nights"] = (item["checkout"] - item["checkin"]).days
        item["channels"] = sorted(item["channels"])
        item["systems"] = sorted(item["systems"])
        item["statuses"] = sorted(item["statuses"])
        item["status_buckets"] = sorted(item["status_buckets"])
        item["room_nos"] = sorted(item["room_nos"])
        unique_prices = sorted(set(item["prices"]))
        item["prices"] = unique_prices
        item["price"] = unique_prices[0] if len(unique_prices) == 1 else None
    return grouped


def cross_validate_sheet_vs_sources(
    blocks: List[ReservationBlock],
    source_records: List[SourceReservation],
) -> List[Dict[str, Any]]:
    if not source_records:
        return []
    issues: List[Dict[str, Any]] = []
    source_primary_ids = {
        normalize_text(record.reservation_no)
        for record in source_records
        if normalize_text(record.reservation_no)
    }
    alias_to_primary, _primary_to_aliases = build_source_reservation_alias_index(source_records)

    def canonical_reservation_no(value: str) -> str:
        reservation_no = normalize_text(value)
        if not reservation_no:
            return ""
        if reservation_no in source_primary_ids:
            return reservation_no
        for alias in reservation_id_alias_tokens(reservation_no):
            primary = alias_to_primary.get(alias)
            if primary:
                return primary
        return reservation_no

    sheet_events_raw = build_sheet_reservation_events(blocks)
    source_events_raw = build_source_reservation_events(source_records)
    sheet_room_date_counts_raw = build_sheet_room_date_counts(blocks)

    sheet_events: List[Dict[str, Any]] = []
    for ev in sheet_events_raw:
        canonical_no = canonical_reservation_no(ev.get("reservation_no", ""))
        if not canonical_no:
            continue
        normalized_room_no = normalize_text(ev.get("room_no"))
        sheet_events.append(
            {
                **ev,
                "reservation_no": canonical_no,
                "room_no": normalized_room_no,
            }
        )

    source_events: List[Dict[str, Any]] = []
    for ev in source_events_raw:
        canonical_no = canonical_reservation_no(ev.get("reservation_no", ""))
        if not canonical_no:
            continue
        normalized_room_no = normalize_text(ev.get("room_no"))
        source_events.append(
            {
                **ev,
                "reservation_no": canonical_no,
                "room_no": normalized_room_no,
            }
        )

    sheet_room_date_counts: Dict[Tuple[str, dt.date, str], int] = defaultdict(int)
    for (reservation_no, date_val, room_no), count in sheet_room_date_counts_raw.items():
        canonical_no = canonical_reservation_no(reservation_no)
        normalized_room_no = normalize_text(room_no)
        if not canonical_no or not normalized_room_no:
            continue
        sheet_room_date_counts[(canonical_no, date_val, normalized_room_no)] += count

    sheet_by_res_date: Dict[Tuple[str, dt.date], Dict[str, Any]] = defaultdict(
        lambda: {"channels": set(), "room_nos": set()}
    )
    source_by_res_date: Dict[Tuple[str, dt.date], Dict[str, Any]] = defaultdict(
        lambda: {"channels": set(), "systems": set(), "room_nos": set(), "statuses": set()}
    )
    sheet_dates_by_res: Dict[str, set[dt.date]] = defaultdict(set)
    source_dates_by_res: Dict[str, set[dt.date]] = defaultdict(set)
    date_missing_in_source_res: set[str] = set()
    date_missing_in_sheet_res: set[str] = set()
    date_mismatch_res_emitted: set[str] = set()

    for ev in sheet_events:
        key = (ev["reservation_no"], ev["date"])
        sheet_by_res_date[key]["channels"].add(ev["channel"])
        if ev.get("room_no"):
            sheet_by_res_date[key]["room_nos"].add(ev["room_no"])
        sheet_dates_by_res[ev["reservation_no"]].add(ev["date"])

    for ev in source_events:
        key = (ev["reservation_no"], ev["date"])
        source_by_res_date[key]["channels"].add(ev["channel"])
        source_by_res_date[key]["systems"].add(ev["source_system"])
        if ev.get("room_no"):
            source_by_res_date[key]["room_nos"].add(ev["room_no"])
        if ev.get("status"):
            source_by_res_date[key]["statuses"].add(ev["status"])
        source_dates_by_res[ev["reservation_no"]].add(ev["date"])

    source_all_dates = sorted({ev["date"] for ev in source_events})
    sheet_all_dates = sorted({ev["date"] for ev in sheet_events})
    source_min_date = source_all_dates[0] if source_all_dates else None
    source_max_date = source_all_dates[-1] if source_all_dates else None
    sheet_min_date = sheet_all_dates[0] if sheet_all_dates else None
    sheet_max_date = sheet_all_dates[-1] if sheet_all_dates else None

    def in_range(
        day: dt.date,
        range_start: dt.date | None,
        range_end: dt.date | None,
    ) -> bool:
        if range_start is None or range_end is None:
            return True
        return range_start <= day <= range_end

    def dates_overlap_target_window(
        days: set[dt.date],
        range_start: dt.date | None,
        range_end: dt.date | None,
    ) -> bool:
        if not days:
            return False
        if range_start is None or range_end is None:
            return True
        for day in days:
            if range_start <= day <= range_end:
                return True
        return False

    all_res_date = set(sheet_by_res_date.keys()) | set(source_by_res_date.keys())
    for reservation_no, date_val in sorted(all_res_date, key=lambda x: (x[1], x[0])):
        in_sheet = (reservation_no, date_val) in sheet_by_res_date
        in_source = (reservation_no, date_val) in source_by_res_date

        if not in_source:
            if not in_range(date_val, source_min_date, source_max_date):
                continue
            sheet_info = sheet_by_res_date[(reservation_no, date_val)]
            date_missing_in_source_res.add(reservation_no)
            issues.append(
                {
                    "type": "EXPECTED_MANUAL_OTA_ON_SHEET"
                    if all(ch in {"STATION", "NAVER"} for ch in sorted(sheet_info["channels"]) if ch)
                    else "MISSING_ACTIVE_IN_PMS",
                    "reservation_no": reservation_no,
                    "date": date_val.isoformat(),
                    "sheet_channels": sorted(sheet_info["channels"]),
                    "source_channels": [],
                    "source_systems": [],
                    "sheet_room_nos": sorted(sheet_info["room_nos"]),
                    "source_room_nos": [],
                }
            )
            continue

        if not in_sheet:
            if not in_range(date_val, sheet_min_date, sheet_max_date):
                continue
            source_info = source_by_res_date[(reservation_no, date_val)]
            date_missing_in_sheet_res.add(reservation_no)
            issues.append(
                {
                    "type": "MISSING_ACTIVE_IN_SHEET",
                    "reservation_no": reservation_no,
                    "date": date_val.isoformat(),
                    "sheet_channels": [],
                    "source_channels": sorted(source_info["channels"]),
                    "source_systems": sorted(source_info["systems"]),
                    "sheet_room_nos": [],
                    "source_room_nos": sorted(source_info["room_nos"]),
                    "source_statuses": sorted(source_info["statuses"]),
                }
            )
            continue

        sheet_channels = set(sheet_by_res_date[(reservation_no, date_val)]["channels"])
        source_channels = set(source_by_res_date[(reservation_no, date_val)]["channels"])
        known_sheet = {c for c in sheet_channels if not is_unknown_or_ambiguous_channel(c)}
        known_source = {c for c in source_channels if not is_unknown_or_ambiguous_channel(c)}
        if known_sheet and known_source and known_sheet != known_source:
            issues.append(
                {
                    "type": "OTA_MISMATCH",
                    "reservation_no": reservation_no,
                    "date": date_val.isoformat(),
                    "sheet_channels": sorted(sheet_channels),
                    "source_channels": sorted(source_channels),
                    "source_systems": sorted(
                        source_by_res_date[(reservation_no, date_val)]["systems"]
                    ),
                    "sheet_room_nos": sorted(sheet_by_res_date[(reservation_no, date_val)]["room_nos"]),
                    "source_room_nos": sorted(source_by_res_date[(reservation_no, date_val)]["room_nos"]),
                }
            )

        sheet_rooms = set(sheet_by_res_date[(reservation_no, date_val)]["room_nos"])
        source_rooms = set(source_by_res_date[(reservation_no, date_val)]["room_nos"])
        if room_sets_conflict(sheet_rooms, source_rooms):
            issues.append(
                {
                    "type": "ROOM_MISMATCH",
                    "reservation_no": reservation_no,
                    "date": date_val.isoformat(),
                    "sheet_room_nos": sorted(sheet_rooms),
                    "source_room_nos": sorted(source_rooms),
                    "sheet_channels": sorted(sheet_channels),
                    "source_channels": sorted(source_channels),
                    "source_systems": sorted(source_by_res_date[(reservation_no, date_val)]["systems"]),
                }
            )

    all_res_nos = set(sheet_dates_by_res.keys()) | set(source_dates_by_res.keys())
    for reservation_no in sorted(all_res_nos):
        if reservation_no in date_missing_in_source_res or reservation_no in date_missing_in_sheet_res:
            continue
        sheet_dates = sheet_dates_by_res.get(reservation_no, set())
        source_dates = source_dates_by_res.get(reservation_no, set())
        if sheet_dates and source_dates and sheet_dates != source_dates:
            date_mismatch_res_emitted.add(reservation_no)
            issues.append(
                {
                    "type": "DATE_MISMATCH",
                    "reservation_no": reservation_no,
                    "date": "",
                    "sheet_dates": sorted(d.isoformat() for d in sheet_dates),
                    "source_dates": sorted(d.isoformat() for d in source_dates),
                    "missing_in_sheet_dates": sorted(
                        d.isoformat() for d in (source_dates - sheet_dates)
                    ),
                    "missing_in_source_dates": sorted(
                        d.isoformat() for d in (sheet_dates - source_dates)
                    ),
                }
            )

    sheet_summary_raw = aggregate_sheet_reservations(blocks)
    source_summary_raw = aggregate_source_reservations(source_records)

    sheet_summary_merged: Dict[str, Dict[str, Any]] = {}
    for raw_reservation_no, sheet in sheet_summary_raw.items():
        canonical_no = canonical_reservation_no(raw_reservation_no)
        if not canonical_no:
            continue
        merged = sheet_summary_merged.setdefault(
            canonical_no,
            {
                "reservation_no": canonical_no,
                "room_nos": set(),
                "room_types": set(),
                "checkin": None,
                "checkout": None,
                "nights": None,
                "platforms": set(),
                "prices": [],
                "blocks": 0,
            },
        )
        merged["room_nos"].update(sheet.get("room_nos") or [])
        merged["room_types"].update(sheet.get("room_types") or [])
        merged["platforms"].update(sheet.get("platforms") or [])
        merged["blocks"] += int(sheet.get("blocks") or 0)
        if sheet.get("price") is not None:
            merged["prices"].append(int(sheet["price"]))
        checkin = sheet.get("checkin")
        checkout = sheet.get("checkout")
        if checkin and (merged["checkin"] is None or checkin < merged["checkin"]):
            merged["checkin"] = checkin
        if checkout and (merged["checkout"] is None or checkout > merged["checkout"]):
            merged["checkout"] = checkout

    sheet_summary: Dict[str, Dict[str, Any]] = {}
    for reservation_no, merged in sheet_summary_merged.items():
        if merged["checkin"] and merged["checkout"]:
            merged["nights"] = (merged["checkout"] - merged["checkin"]).days
        room_nos_sorted = sorted(merged["room_nos"])
        room_types_sorted = sorted(merged["room_types"])
        platforms_sorted = sorted(merged["platforms"])
        sheet_summary[reservation_no] = {
            "reservation_no": reservation_no,
            "room_nos": room_nos_sorted,
            "room_types": room_types_sorted,
            "room_no": ",".join(room_nos_sorted),
            "room_type": ",".join(room_types_sorted),
            "checkin": merged["checkin"],
            "checkout": merged["checkout"],
            "nights": merged["nights"],
            "platforms": platforms_sorted,
            "price": merged["prices"][0] if merged["prices"] else None,
            "blocks": merged["blocks"],
        }

    source_summary_merged: Dict[str, Dict[str, Any]] = {}
    for raw_reservation_no, source in source_summary_raw.items():
        canonical_no = canonical_reservation_no(raw_reservation_no)
        if not canonical_no:
            continue
        merged = source_summary_merged.setdefault(
            canonical_no,
            {
                "reservation_no": canonical_no,
                "checkin": None,
                "checkout": None,
                "nights": None,
                "channels": set(),
                "room_nos": set(),
                "prices": set(),
                "systems": set(),
                "statuses": set(),
                "status_buckets": set(),
                "audit_anomaly": False,
            },
        )
        checkin = source.get("checkin")
        checkout = source.get("checkout")
        if checkin and (merged["checkin"] is None or checkin < merged["checkin"]):
            merged["checkin"] = checkin
        if checkout and (merged["checkout"] is None or checkout > merged["checkout"]):
            merged["checkout"] = checkout
        merged["channels"].update(source.get("channels") or [])
        merged["room_nos"].update(source.get("room_nos") or [])
        merged["systems"].update(source.get("systems") or [])
        merged["statuses"].update(source.get("statuses") or [])
        merged["status_buckets"].update(source.get("status_buckets") or [])
        if source.get("audit_anomaly"):
            merged["audit_anomaly"] = True
        for price in source.get("prices") or []:
            if price is not None:
                merged["prices"].add(int(price))
        if source.get("price") is not None:
            merged["prices"].add(int(source["price"]))

    source_summary: Dict[str, Dict[str, Any]] = {}
    for reservation_no, merged in source_summary_merged.items():
        if merged["checkin"] and merged["checkout"]:
            merged["nights"] = (merged["checkout"] - merged["checkin"]).days
        prices_sorted = sorted(merged["prices"])
        source_summary[reservation_no] = {
            "reservation_no": reservation_no,
            "checkin": merged["checkin"],
            "checkout": merged["checkout"],
            "nights": merged["nights"],
            "channels": sorted(merged["channels"]),
            "room_nos": sorted(merged["room_nos"]),
            "prices": prices_sorted,
            "price": prices_sorted[0] if len(prices_sorted) == 1 else None,
            "systems": sorted(merged["systems"]),
            "statuses": sorted(merged["statuses"]),
            "status_buckets": sorted(merged["status_buckets"]),
            "audit_anomaly": merged["audit_anomaly"],
        }

    all_reservations = set(sheet_summary.keys()) | set(source_summary.keys())
    for reservation_no in sorted(all_reservations):
        in_sheet = reservation_no in sheet_summary
        in_source = reservation_no in source_summary
        if not in_source:
            if reservation_no in date_missing_in_source_res:
                continue
            sheet_dates = sheet_dates_by_res.get(reservation_no, set())
            if not dates_overlap_target_window(
                sheet_dates, source_min_date, source_max_date
            ):
                continue
            issues.append(
                {
                    "type": "MISSING_ACTIVE_IN_PMS",
                    "reservation_no": reservation_no,
                    "date": "",
                }
            )
            continue
        if not in_sheet:
            if reservation_no in date_missing_in_sheet_res:
                continue
            source_dates = source_dates_by_res.get(reservation_no, set())
            if not dates_overlap_target_window(
                source_dates, sheet_min_date, sheet_max_date
            ):
                continue
            src = source_summary[reservation_no]
            issues.append(
                {
                    "type": "MISSING_ACTIVE_IN_SHEET",
                    "reservation_no": reservation_no,
                    "date": "",
                    "source_channels": src.get("channels", []),
                    "source_room_nos": src.get("room_nos", []),
                    "source_systems": src.get("systems", []),
                    "source_statuses": src.get("statuses", []),
                }
            )
            continue

        sheet = sheet_summary[reservation_no]
        source = source_summary[reservation_no]
        if "CANCELED" in set(source.get("status_buckets") or []):
            issues.append(
                {
                    "type": "CANCELED_STILL_IN_SHEET",
                    "reservation_no": reservation_no,
                    "date": "",
                    "source_statuses": source.get("statuses", []),
                    "sheet_channels": sheet.get("platforms", []),
                }
            )
            continue
        if source.get("audit_anomaly"):
            issues.append(
                {
                    "type": "ACTIVE_EXPECTED_BUT_PMS_AUDIT_ANOMALY",
                    "reservation_no": reservation_no,
                    "date": "",
                    "source_statuses": source.get("statuses", []),
                    "sheet_channels": sheet.get("platforms", []),
                }
            )
        date_mismatch_payload: Dict[str, Any] = {}
        if sheet.get("checkin") and source.get("checkin") and sheet["checkin"] != source["checkin"]:
            date_mismatch_payload["sheet_checkin"] = sheet["checkin"].isoformat()
            date_mismatch_payload["source_checkin"] = source["checkin"].isoformat()
        if sheet.get("checkout") and source.get("checkout") and sheet["checkout"] != source["checkout"]:
            date_mismatch_payload["sheet_checkout"] = sheet["checkout"].isoformat()
            date_mismatch_payload["source_checkout"] = source["checkout"].isoformat()
        if date_mismatch_payload and reservation_no not in date_mismatch_res_emitted:
            issues.append(
                {
                    "type": "DATE_MISMATCH",
                    "reservation_no": reservation_no,
                    "date": "",
                    **date_mismatch_payload,
                }
            )
        if sheet.get("nights") is not None and source.get("nights") is not None:
            if int(sheet["nights"]) != int(source["nights"]):
                issues.append(
                    {
                        "type": "NIGHTS_MISMATCH",
                        "reservation_no": reservation_no,
                        "date": "",
                        "sheet_nights": int(sheet["nights"]),
                        "source_nights": int(source["nights"]),
                    }
                )

        sheet_price = sheet.get("price")
        source_price = source.get("price")
        if sheet_price is not None and source_price is not None and int(sheet_price) != int(source_price):
            if not is_commission_adjusted_price_match(
                int(sheet_price),
                int(source_price),
                set(source.get("channels") or []),
            ):
                issues.append(
                    {
                        "type": "PRICE_MISMATCH_SOURCE",
                        "reservation_no": reservation_no,
                        "date": "",
                        "sheet_price": int(sheet_price),
                        "source_price": int(source_price),
                    }
                )

        sheet_room_nos = set(split_room_tokens(sheet.get("room_no") or ""))
        source_room_nos = set(source.get("room_nos") or [])
        extra_sheet_room_nos = unmatched_room_tokens(sheet_room_nos, source_room_nos)
        missing_in_sheet_room_nos = unmatched_room_tokens(source_room_nos, sheet_room_nos)
        known_sheet_channels = {
            normalize_text(value).upper()
            for value in (sheet.get("platforms") or [])
            if not is_unknown_or_ambiguous_channel(str(value))
        }
        known_source_channels = {
            normalize_text(value).upper()
            for value in (source.get("channels") or [])
            if not is_unknown_or_ambiguous_channel(str(value))
        }
        if room_sets_conflict(sheet_room_nos, source_room_nos):
            issues.append(
                {
                    "type": "ROOM_MISMATCH",
                    "reservation_no": reservation_no,
                    "date": "",
                    "sheet_room_nos": sorted(sheet_room_nos),
                    "source_room_nos": sorted(source_room_nos),
                }
            )
        elif (
            "PMS" in set(source.get("systems") or [])
            and extra_sheet_room_nos
            and source_room_nos
            and len(sheet_room_nos) > len(source_room_nos)
        ):
            issues.append(
                {
                    "type": "PMS_DUPLICATE_SHEET_ROOMS_SUSPECT",
                    "reservation_no": reservation_no,
                    "date": "",
                    "sheet_room_nos": sorted(sheet_room_nos),
                    "source_room_nos": sorted(source_room_nos),
                    "source_systems": source.get("systems", []),
                    "source_statuses": source.get("statuses", []),
                    "extra_sheet_room_nos": extra_sheet_room_nos,
                }
            )
        elif (
            "PMS" in set(source.get("systems") or [])
            and missing_in_sheet_room_nos
            and sheet_room_nos
            and len(source_room_nos) > len(sheet_room_nos)
        ):
            issues.append(
                {
                    "type": "PMS_MISSING_SHEET_ROOMS_SUSPECT",
                    "reservation_no": reservation_no,
                    "date": "",
                    "sheet_room_nos": sorted(sheet_room_nos),
                    "source_room_nos": sorted(source_room_nos),
                    "source_systems": source.get("systems", []),
                    "source_statuses": source.get("statuses", []),
                    "missing_in_sheet_room_nos": missing_in_sheet_room_nos,
                }
            )
        if (
            "PMS" in set(source.get("systems") or [])
            and len(known_sheet_channels) > 1
            and len(known_source_channels) == 1
        ):
            extra_sheet_channels = unmatched_known_tokens(
                known_sheet_channels, known_source_channels
            )
            if extra_sheet_channels:
                issues.append(
                    {
                        "type": "PMS_MULTI_CHANNEL_SHEET_SUSPECT",
                        "reservation_no": reservation_no,
                        "date": "",
                        "sheet_channels": sorted(known_sheet_channels),
                        "source_channels": sorted(known_source_channels),
                        "source_systems": source.get("systems", []),
                        "source_statuses": source.get("statuses", []),
                        "extra_sheet_channels": extra_sheet_channels,
                    }
                )
        if "PMS" in set(source.get("systems") or []):
            for room_no in sorted(sheet_room_nos):
                checkin = sheet.get("checkin")
                checkout = sheet.get("checkout")
                if not checkin or not checkout:
                    continue
                duplicate_dates: List[str] = []
                max_sheet_event_count = 0
                if unmatched_room_tokens({room_no}, source_room_nos):
                    continue
                for date_val in stay_dates(checkin, checkout):
                    count = sheet_room_date_counts.get((reservation_no, date_val, room_no), 0)
                    if count > 1:
                        duplicate_dates.append(date_val.isoformat())
                        max_sheet_event_count = max(max_sheet_event_count, count)
                if duplicate_dates:
                    issues.append(
                        {
                            "type": "PMS_DUPLICATE_SHEET_STAY_SUSPECT",
                            "reservation_no": reservation_no,
                            "date": "",
                            "room_no": room_no,
                            "sheet_room_nos": sorted(sheet_room_nos),
                            "source_room_nos": sorted(source_room_nos),
                            "source_systems": source.get("systems", []),
                            "source_statuses": source.get("statuses", []),
                            "duplicate_dates": duplicate_dates,
                            "sheet_event_count": max_sheet_event_count,
                        }
                    )

    return issues
