from __future__ import annotations

import csv
import datetime as dt
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from src.domain.report_policy import (
    DEFAULT_ARRIVAL_ARTIFACT_POLICY,
    DEFAULT_ORDERLIST_POLICY,
    ArrivalArtifactPolicy,
    OrderlistPolicy,
    format_ops_room_label,
    get_periodic_room_cleaning_dates,
    resolve_arrival_building,
    select_orderlist_rule,
)
from src.domain.sheet_domain import ReservationBlock, normalize_room_no_key, normalize_text

ORDERLIST_FIELDNAMES = [
    "date",
    "weekday",
    "branch",
    "building",
    "room_no",
    "ops_room_label",
    "room_type",
    "task_label",
    "task_rule_id",
    "arrival_count",
    "departure_count",
    "stayover_count",
    "turnover_flag",
    "arrival_reservation_nos",
    "departure_reservation_nos",
    "stayover_reservation_nos",
    "channels",
    "note_heads",
]

ARRIVAL_FIELDNAMES = [
    "section",
    "date",
    "weekday",
    "branch",
    "building",
    "room_no",
    "ops_room_label",
    "room_type",
    "reservation_no",
    "reservation_key",
    "channel",
    "checkin",
    "checkout",
    "nights",
    "turnover_flag",
    "arrival_reservation_nos",
    "departure_reservation_nos",
    "arrival_channels",
    "departure_channels",
    "note_head",
]

WEEKDAY_LABELS = ("월", "화", "수", "목", "금", "토", "일")


@dataclass
class RoomDayContext:
    date: dt.date
    branch: str
    building: str
    room_no: str
    ops_room_label: str
    room_type: str
    arrivals: List[ReservationBlock] = field(default_factory=list)
    departures: List[ReservationBlock] = field(default_factory=list)
    stayovers: List[ReservationBlock] = field(default_factory=list)


def build_orderlist_artifact(
    blocks: List[ReservationBlock],
    report_start: Optional[dt.date],
    report_end: Optional[dt.date],
    policy: OrderlistPolicy = DEFAULT_ORDERLIST_POLICY,
) -> Dict[str, Any]:
    contexts = build_room_day_contexts(blocks, report_start, report_end)
    rows: List[Dict[str, Any]] = []
    label_counts: Counter[str] = Counter()
    for context in contexts:
        candidates = []
        for block in context.arrivals + context.stayovers + context.departures:
            rule = classify_orderlist_block_for_date(block, context.date, policy=policy)
            if rule is not None:
                candidates.append((rule.priority, rule))
        if not candidates:
            continue
        candidates.sort(key=lambda item: item[0], reverse=True)
        _, rule = candidates[0]
        row = {
            "date": context.date.isoformat(),
            "weekday": weekday_label(context.date),
            "branch": context.branch,
            "building": context.building,
            "room_no": context.room_no,
            "ops_room_label": context.ops_room_label,
            "room_type": context.room_type,
            "task_label": rule.label,
            "task_rule_id": rule.rule_id,
            "arrival_count": len(context.arrivals),
            "departure_count": len(context.departures),
            "stayover_count": len(context.stayovers),
            "turnover_flag": "Y" if context.arrivals and context.departures else "",
            "arrival_reservation_nos": join_block_values(context.arrivals, "reservation_no"),
            "departure_reservation_nos": join_block_values(context.departures, "reservation_no"),
            "stayover_reservation_nos": join_block_values(context.stayovers, "reservation_no"),
            "channels": join_unique(
                block.channel for block in context.arrivals + context.departures + context.stayovers
            ),
            "note_heads": join_unique(
                note_head(block.note) for block in context.arrivals + context.departures + context.stayovers
            ),
        }
        rows.append(row)
        label_counts[rule.label] += 1
    return {
        "rows": rows,
        "fieldnames": ORDERLIST_FIELDNAMES,
        "counts": {
            "total_rows": len(rows),
            "by_label": dict(label_counts),
        },
        "policy": {
            "core_labels": list(policy.core_labels),
            "exclude_departure_only": bool(policy.exclude_departure_only),
            "periodic_room_cleaning_min_nights": policy.periodic_room_cleaning_min_nights,
            "periodic_room_cleaning_first_offset_days": policy.periodic_room_cleaning_first_offset_days,
            "periodic_room_cleaning_interval_days": policy.periodic_room_cleaning_interval_days,
            "decision_rules": [
                {
                    "rule_id": rule.rule_id,
                    "label": rule.label,
                    "priority": rule.priority,
                }
                for rule in sorted(policy.decision_rules, key=lambda item: item.priority, reverse=True)
            ],
        },
    }


def build_arrival_artifact(
    blocks: List[ReservationBlock],
    report_start: Optional[dt.date],
    report_end: Optional[dt.date],
    policy: ArrivalArtifactPolicy = DEFAULT_ARRIVAL_ARTIFACT_POLICY,
) -> Dict[str, Any]:
    contexts = build_room_day_contexts(blocks, report_start, report_end, policy=policy)
    rows: List[Dict[str, Any]] = []
    section_counts: Counter[str] = Counter()

    for context in contexts:
        is_turnover = bool(context.arrivals and context.departures)
        if is_turnover and policy.separate_turnover_section:
            row = build_turnover_row(context)
            rows.append(row)
            section_counts["TURNOVER"] += 1
            continue

        for block in sorted(context.arrivals, key=block_sort_key):
            row = build_arrival_or_departure_row("ARRIVAL", context, block, is_turnover)
            rows.append(row)
            section_counts["ARRIVAL"] += 1
        for block in sorted(context.departures, key=block_sort_key):
            row = build_arrival_or_departure_row("DEPARTURE", context, block, is_turnover)
            rows.append(row)
            section_counts["DEPARTURE"] += 1

    return {
        "rows": rows,
        "fieldnames": ARRIVAL_FIELDNAMES,
        "counts": {
            "total_rows": len(rows),
            "by_section": dict(section_counts),
        },
        "policy": {
            "separate_turnover_section": bool(policy.separate_turnover_section),
            "building_rules": [
                {
                    "building": rule.building,
                    "room_prefixes": list(rule.room_prefixes),
                    "fallback": bool(rule.fallback),
                }
                for rule in policy.building_rules
            ],
        },
    }


def write_tabular_csv(path: Path, rows: List[Dict[str, Any]], fieldnames: List[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def write_tabular_tsv(path: Path, rows: List[Dict[str, Any]], fieldnames: List[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter="\t")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def build_room_day_contexts(
    blocks: List[ReservationBlock],
    report_start: Optional[dt.date],
    report_end: Optional[dt.date],
    policy: ArrivalArtifactPolicy = DEFAULT_ARRIVAL_ARTIFACT_POLICY,
) -> List[RoomDayContext]:
    if report_start is None or report_end is None:
        return []
    context_map: Dict[Tuple[dt.date, str], RoomDayContext] = {}
    for block in blocks:
        if block.checkin is None or block.checkout is None:
            continue
        branch = normalize_text(block.branch)
        building = resolve_arrival_building(block.room_no, policy=policy)
        room_no_key = normalize_room_no_key(block.room_no)
        room_no = normalize_text(block.room_no)
        ops_room_label = format_ops_room_label(block.room_no)
        room_type = normalize_text(block.room_type)
        if report_start <= block.checkin <= report_end:
            context = context_map.setdefault(
                (block.checkin, room_no_key),
                RoomDayContext(
                    date=block.checkin,
                    branch=branch,
                    building=building,
                    room_no=room_no,
                    ops_room_label=ops_room_label,
                    room_type=room_type,
                ),
            )
            context.arrivals.append(block)
        if report_start <= block.checkout <= report_end:
            context = context_map.setdefault(
                (block.checkout, room_no_key),
                RoomDayContext(
                    date=block.checkout,
                    branch=branch,
                    building=building,
                    room_no=room_no,
                    ops_room_label=ops_room_label,
                    room_type=room_type,
                ),
            )
            context.departures.append(block)

        stayover_start = max(report_start, block.checkin + dt.timedelta(days=1))
        stayover_end = min(report_end, block.checkout - dt.timedelta(days=1))
        current = stayover_start
        while current <= stayover_end:
            context = context_map.setdefault(
                (current, room_no_key),
                RoomDayContext(
                    date=current,
                    branch=branch,
                    building=building,
                    room_no=room_no,
                    ops_room_label=ops_room_label,
                    room_type=room_type,
                ),
            )
            context.stayovers.append(block)
            current += dt.timedelta(days=1)

    return sorted(
        context_map.values(),
        key=lambda item: (item.date, item.building, normalize_room_no_key(item.room_no)),
    )


def classify_orderlist_block_for_date(
    block: ReservationBlock,
    target_date: dt.date,
    policy: OrderlistPolicy = DEFAULT_ORDERLIST_POLICY,
):
    is_arrival_day = bool(block.checkin and block.checkin == target_date)
    is_departure_day = bool(block.checkout and block.checkout == target_date)
    is_stayover_day = bool(
        block.checkin
        and block.checkout
        and block.checkin < target_date < block.checkout
    )
    if policy.exclude_departure_only and is_departure_day and not is_arrival_day and not is_stayover_day:
        return None
    return select_orderlist_rule(
        {
            "is_arrival_day": is_arrival_day,
            "is_departure_day": is_departure_day,
            "is_stayover_day": is_stayover_day,
            "is_turnover_day": is_arrival_day and is_departure_day,
            "is_periodic_room_cleaning_day": target_date
            in get_periodic_room_cleaning_dates(block.checkin, block.nights, policy=policy),
        },
        policy=policy,
    )


def build_arrival_or_departure_row(
    section: str,
    context: RoomDayContext,
    block: ReservationBlock,
    is_turnover: bool,
) -> Dict[str, Any]:
    return {
        "section": section,
        "date": context.date.isoformat(),
        "weekday": weekday_label(context.date),
        "branch": context.branch,
        "building": context.building,
        "room_no": context.room_no,
        "ops_room_label": context.ops_room_label,
        "room_type": context.room_type,
        "reservation_no": normalize_text(block.reservation_no),
        "reservation_key": normalize_text(block.reservation_key),
        "channel": normalize_text(block.channel or block.platform),
        "checkin": block.checkin.isoformat() if block.checkin else "",
        "checkout": block.checkout.isoformat() if block.checkout else "",
        "nights": block.nights,
        "turnover_flag": "Y" if is_turnover else "",
        "arrival_reservation_nos": join_block_values(context.arrivals, "reservation_no"),
        "departure_reservation_nos": join_block_values(context.departures, "reservation_no"),
        "arrival_channels": join_unique(item.channel or item.platform for item in context.arrivals),
        "departure_channels": join_unique(item.channel or item.platform for item in context.departures),
        "note_head": note_head(block.note),
    }


def build_turnover_row(context: RoomDayContext) -> Dict[str, Any]:
    primary = context.arrivals[0] if context.arrivals else (context.departures[0] if context.departures else None)
    return {
        "section": "TURNOVER",
        "date": context.date.isoformat(),
        "weekday": weekday_label(context.date),
        "branch": context.branch,
        "building": context.building,
        "room_no": context.room_no,
        "ops_room_label": context.ops_room_label,
        "room_type": context.room_type,
        "reservation_no": normalize_text(primary.reservation_no) if primary else "",
        "reservation_key": normalize_text(primary.reservation_key) if primary else "",
        "channel": normalize_text(primary.channel or primary.platform) if primary else "",
        "checkin": primary.checkin.isoformat() if primary and primary.checkin else "",
        "checkout": primary.checkout.isoformat() if primary and primary.checkout else "",
        "nights": primary.nights if primary else "",
        "turnover_flag": "Y",
        "arrival_reservation_nos": join_block_values(context.arrivals, "reservation_no"),
        "departure_reservation_nos": join_block_values(context.departures, "reservation_no"),
        "arrival_channels": join_unique(item.channel or item.platform for item in context.arrivals),
        "departure_channels": join_unique(item.channel or item.platform for item in context.departures),
        "note_head": join_unique(note_head(item.note) for item in context.arrivals + context.departures),
    }


def join_block_values(blocks: Iterable[ReservationBlock], field_name: str) -> str:
    return join_unique(getattr(block, field_name, "") for block in blocks)


def join_unique(values: Iterable[Any]) -> str:
    seen: List[str] = []
    for value in values:
        normalized = normalize_text(str(value or ""))
        if not normalized or normalized in seen:
            continue
        seen.append(normalized)
    return "|".join(seen)


def note_head(value: str, limit: int = 80) -> str:
    text = normalize_text(value)
    return text[:limit]


def weekday_label(value: dt.date) -> str:
    return WEEKDAY_LABELS[value.weekday()]


def block_sort_key(block: ReservationBlock) -> Tuple[str, str, str]:
    return (
        block.checkin.isoformat() if block.checkin else "",
        block.checkout.isoformat() if block.checkout else "",
        normalize_text(block.reservation_no),
    )
