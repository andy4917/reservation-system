from __future__ import annotations

from dataclasses import dataclass, field
import datetime as dt
from typing import Dict, Optional, Tuple

from src.domain.sheet_domain import normalize_room_no_key, normalize_text

CORE_ORDERLIST_LABELS: Tuple[str, ...] = ("룸메이크업", "긴급클리닝", "룸클리닝")


@dataclass(frozen=True)
class OrderlistRuleCondition:
    is_arrival_day: Optional[bool] = None
    is_departure_day: Optional[bool] = None
    is_stayover_day: Optional[bool] = None
    is_turnover_day: Optional[bool] = None
    is_periodic_room_cleaning_day: Optional[bool] = None


@dataclass(frozen=True)
class OrderlistDecisionRule:
    rule_id: str
    label: str
    priority: int
    condition: OrderlistRuleCondition


@dataclass(frozen=True)
class OrderlistPolicy:
    core_labels: Tuple[str, ...] = CORE_ORDERLIST_LABELS
    exclude_departure_only: bool = True
    periodic_room_cleaning_min_nights: int = 4
    periodic_room_cleaning_first_offset_days: int = 3
    periodic_room_cleaning_interval_days: int = 4
    decision_rules: Tuple[OrderlistDecisionRule, ...] = (
        OrderlistDecisionRule(
            rule_id="arrival_emergency_cleaning",
            label="긴급클리닝",
            priority=300,
            condition=OrderlistRuleCondition(
                is_arrival_day=True,
            ),
        ),
        OrderlistDecisionRule(
            rule_id="periodic_room_cleaning",
            label="룸클리닝",
            priority=200,
            condition=OrderlistRuleCondition(
                is_periodic_room_cleaning_day=True,
            ),
        ),
        OrderlistDecisionRule(
            rule_id="stayover_room_makeup",
            label="룸메이크업",
            priority=100,
            condition=OrderlistRuleCondition(
                is_stayover_day=True,
            ),
        ),
    )


@dataclass(frozen=True)
class ArrivalBuildingRule:
    building: str
    room_prefixes: Tuple[str, ...] = ()
    fallback: bool = False


@dataclass(frozen=True)
class ArrivalArtifactPolicy:
    separate_turnover_section: bool = True
    building_rules: Tuple[ArrivalBuildingRule, ...] = (
        ArrivalBuildingRule(building="A동", room_prefixes=("A",)),
        ArrivalBuildingRule(building="B동", fallback=True),
    )
    flag_aliases: Dict[str, Tuple[str, ...]] = field(
        default_factory=lambda: {
            "lco": ("LCO", "늦은퇴실", "레이트체크아웃"),
            "ooo": ("OOO",),
            "vip": ("VIP",),
            "marketing": ("MARKETING", "마케팅"),
        }
    )


DEFAULT_ORDERLIST_POLICY = OrderlistPolicy()
DEFAULT_ARRIVAL_ARTIFACT_POLICY = ArrivalArtifactPolicy()


def _condition_matches(expected: Optional[bool], actual: bool) -> bool:
    if expected is None:
        return True
    return expected is actual


def select_orderlist_rule(
    context: Dict[str, bool],
    policy: OrderlistPolicy = DEFAULT_ORDERLIST_POLICY,
) -> Optional[OrderlistDecisionRule]:
    ordered = sorted(policy.decision_rules, key=lambda rule: rule.priority, reverse=True)
    for rule in ordered:
        condition = rule.condition
        if not _condition_matches(condition.is_arrival_day, bool(context.get("is_arrival_day"))):
            continue
        if not _condition_matches(condition.is_departure_day, bool(context.get("is_departure_day"))):
            continue
        if not _condition_matches(condition.is_stayover_day, bool(context.get("is_stayover_day"))):
            continue
        if not _condition_matches(condition.is_turnover_day, bool(context.get("is_turnover_day"))):
            continue
        if not _condition_matches(
            condition.is_periodic_room_cleaning_day,
            bool(context.get("is_periodic_room_cleaning_day")),
        ):
            continue
        return rule
    return None


def format_ops_room_label(room_no: str) -> str:
    text = normalize_text(room_no).upper()
    if not text:
        return ""
    if text.startswith(("A", "B")):
        return text
    digits = "".join(ch for ch in text if ch.isdigit())
    if not digits:
        return text
    number = int(digits, 10)
    if number >= 1301:
        return f"A{number - 1000}"
    return f"B{number}"


def resolve_arrival_building(
    room_no: str,
    policy: ArrivalArtifactPolicy = DEFAULT_ARRIVAL_ARTIFACT_POLICY,
) -> str:
    room_key = normalize_room_no_key(format_ops_room_label(room_no) or room_no)
    fallback = ""
    for rule in policy.building_rules:
        if rule.fallback:
            fallback = rule.building
        for prefix in rule.room_prefixes:
            normalized_prefix = normalize_text(prefix).upper()
            if normalized_prefix and room_key.startswith(normalized_prefix):
                return rule.building
    return fallback


def get_periodic_room_cleaning_dates(
    checkin: Optional[dt.date],
    nights: int,
    policy: OrderlistPolicy = DEFAULT_ORDERLIST_POLICY,
) -> Tuple[dt.date, ...]:
    if checkin is None or nights < policy.periodic_room_cleaning_min_nights:
        return ()
    dates = []
    checkout = checkin + dt.timedelta(days=nights)
    current = checkin + dt.timedelta(days=policy.periodic_room_cleaning_first_offset_days)
    while current < checkout:
        dates.append(current)
        current += dt.timedelta(days=policy.periodic_room_cleaning_interval_days)
    return tuple(dates)
