from __future__ import annotations

import csv
import datetime as dt
from pathlib import Path
from typing import Any, Dict, List, Tuple

from src.domain.sheet_domain import DailyStat, ReservationBlock, SourceReservation, normalize_text


def col_one_based_to_a1(col_one_based: int) -> str:
    value = max(int(col_one_based), 1)
    letters: List[str] = []
    while value > 0:
        value, rem = divmod(value - 1, 26)
        letters.append(chr(ord("A") + rem))
    return "".join(reversed(letters))


def write_blocks_csv(path: Path, blocks: List[ReservationBlock]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "row",
                "room_type",
                "room_no",
                "start_col",
                "end_col",
                "checkin",
                "checkout",
                "nights",
                "checkout_exclusive",
                "price",
                "branch",
                "channel",
                "reservation_no",
                "reservation_key",
                "platform",
                "color_hex",
                "source_columns",
                "start_col_a1",
                "end_col_a1",
                "source_columns_a1",
                "group_key",
                "part_index",
                "parts_total",
                "month_split",
                "note_head",
                "nationality_nights",
            ]
        )
        for b in blocks:
            start_col_one_based = b.start_col + 1
            end_col_one_based = b.end_col + 1
            source_columns_one_based = [col + 1 for col in b.source_columns]
            writer.writerow(
                [
                    b.row + 1,
                    b.room_type,
                    b.room_no,
                    b.start_col + 1,
                    b.end_col + 1,
                    b.checkin.isoformat() if b.checkin else "",
                    b.checkout.isoformat() if b.checkout else "",
                    b.nights,
                    b.checkout.isoformat() if b.checkout else "",
                    b.price if b.price is not None else "",
                    b.branch,
                    b.channel,
                    b.reservation_no or "",
                    b.reservation_key or "",
                    b.platform,
                    b.color_hex or "",
                    "|".join(str(col) for col in source_columns_one_based),
                    col_one_based_to_a1(start_col_one_based),
                    col_one_based_to_a1(end_col_one_based),
                    "|".join(col_one_based_to_a1(col) for col in source_columns_one_based),
                    b.group_key,
                    b.part_index,
                    b.parts_total,
                    "Y" if b.month_split else "",
                    normalize_text(b.note)[:120],
                    normalize_text(b.nationality_nights),
                ]
            )


def write_daily_csv(path: Path, rows: List[DailyStat]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "date",
                "weekday",
                "branch",
                "occupied",
                "blocked",
                "vacant",
                "vac",
                "vip",
                "marketing",
                "ooo",
                "sold",
                "total_rooms",
                "unknown_or_other",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row.date.isoformat(),
                    row.weekday,
                    row.branch,
                    row.occupied,
                    row.blocked,
                    row.vacant,
                    row.vac,
                    row.vip,
                    row.marketing,
                    row.ooo,
                    row.sold,
                    row.total_rooms,
                    row.unknown_or_other,
                ]
            )


def write_room_type_vac_csv(path: Path, vac_map: Dict[Tuple[dt.date, str], int]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "room_type", "vac_count"])
        for (date_val, room_type), count in sorted(
            vac_map.items(), key=lambda x: (x[0][0], x[0][1])
        ):
            writer.writerow([date_val.isoformat(), room_type, count])


def write_room_rows_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    keys = [
        "date",
        "row_type",
        "room_row",
        "branch",
        "room_no",
        "building",
        "room_number",
        "sheet_room_no",
        "canonical_id",
        "pms_room_no",
        "parsed_room_type",
        "room_type_source",
        "raw_text",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for row in rows or []:
            writer.writerow({k: row.get(k, "") for k in keys})


def write_room_registry_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    keys = [
        "branch",
        "building",
        "room_number",
        "sheet_room_no",
        "canonical_id",
        "pms_room_no",
        "sheet_rows",
        "sheet_row_first",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for row in rows or []:
            writer.writerow({k: row.get(k, "") for k in keys})


def write_room_identity_issues_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    keys = [
        "issue_type",
        "branch",
        "pms_room_no",
        "canonical_ids",
        "sheet_room_nos",
        "sheet_rows",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for row in rows or []:
            writer.writerow({k: row.get(k, "") for k in keys})


def write_recommendations_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    keys = [
        "date",
        "weekday",
        "vac",
        "vac_basis",
        "sold",
        "total_rooms",
        "station_existing",
        "station_max",
        "station_irregular",
        "station_recommended",
        "naver_existing",
        "naver_max",
        "naver_recommended",
        "reason",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k) for k in keys})


def write_cross_validation_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    if not rows:
        with path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "type",
                    "reservation_no",
                    "date",
                    "sheet_channels",
                    "source_channels",
                    "source_systems",
                    "sheet_room_nos",
                    "source_room_nos",
                    "extra_sheet_room_nos",
                    "missing_in_sheet_room_nos",
                    "extra_sheet_channels",
                    "duplicate_dates",
                    "room_no",
                    "sheet_event_count",
                    "sheet_dates",
                    "source_dates",
                    "missing_in_sheet_dates",
                    "missing_in_source_dates",
                    "sheet_checkin",
                    "source_checkin",
                    "sheet_checkout",
                    "source_checkout",
                    "sheet_nights",
                    "source_nights",
                    "sheet_price",
                    "source_price",
                    "source_statuses",
                ]
            )
        return

    keys = [
        "type",
        "reservation_no",
        "date",
        "sheet_channels",
        "source_channels",
        "source_systems",
        "sheet_room_nos",
        "source_room_nos",
        "extra_sheet_room_nos",
        "missing_in_sheet_room_nos",
        "extra_sheet_channels",
        "duplicate_dates",
        "room_no",
        "sheet_event_count",
        "sheet_dates",
        "source_dates",
        "missing_in_sheet_dates",
        "missing_in_source_dates",
        "sheet_checkin",
        "source_checkin",
        "sheet_checkout",
        "source_checkout",
        "sheet_nights",
        "source_nights",
        "sheet_price",
        "source_price",
        "source_statuses",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            row_out = dict(row)
            for k in keys:
                if isinstance(row_out.get(k), list):
                    row_out[k] = "|".join(str(x) for x in row_out[k])
            writer.writerow({k: row_out.get(k, "") for k in keys})


def write_source_reservations_csv(path: Path, rows: List[SourceReservation]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "source_system",
                "reservation_no",
                "channel",
                "checkin",
                "checkout",
                "nights",
                    "room_no",
                    "price",
                    "account",
                    "status",
                    "status_bucket",
                "audit_anomaly",
                "branch",
                "reservation_ref",
                "nationality_nights",
                ]
        )
        for r in rows:
            writer.writerow(
                [
                    r.source_system,
                    r.reservation_no,
                    r.channel,
                    r.checkin.isoformat(),
                    r.checkout.isoformat(),
                    r.nights,
                    r.room_no,
                    r.price if r.price is not None else "",
                    r.account,
                    r.status,
                    r.status_bucket,
                    "Y" if r.audit_anomaly else "",
                    r.branch,
                    r.reservation_ref,
                    r.nationality_nights,
                ]
            )


def write_long_tail_ota_candidates_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    keys = [
        "reason",
        "row",
        "col",
        "date",
        "branch",
        "room_no",
        "status",
        "channel",
        "candidate_channel",
        "reservation_no",
        "candidate_basis",
        "color_hex",
        "formatted_value",
        "note_head",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for row in rows or []:
            writer.writerow({k: row.get(k, "") for k in keys})
