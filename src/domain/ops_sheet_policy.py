from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

from src.domain.sheet_domain import extract_sheet_id, normalize_text

DEFAULT_OPS_SHEET_SPREADSHEET = "1MfvPh2msnoXbG8Q2Mjpk5KVelh3Rv3HQ-SKt9P6xqjE"


@dataclass(frozen=True)
class OpsSheetTabPolicy:
    tab_name: str
    branch: str
    building: str
    property_label: str
    sheet_gid: str = ""
    sheet_url: str = ""


DEFAULT_OPS_SHEET_TABS: Tuple[OpsSheetTabPolicy, ...] = (
    OpsSheetTabPolicy(
        tab_name="코엑스",
        branch="COEX",
        building="B동",
        property_label="UH suite 더 코엑스",
        sheet_gid="1932864543",
        sheet_url="https://docs.google.com/spreadsheets/d/1MfvPh2msnoXbG8Q2Mjpk5KVelh3Rv3HQ-SKt9P6xqjE/edit?gid=1932864543#gid=1932864543",
    ),
    OpsSheetTabPolicy(
        tab_name="코엑스2",
        branch="COEX",
        building="A동",
        property_label="UH suite 더 코엑스2",
        sheet_gid="1165686679",
        sheet_url="https://docs.google.com/spreadsheets/d/1MfvPh2msnoXbG8Q2Mjpk5KVelh3Rv3HQ-SKt9P6xqjE/edit?gid=1165686679#gid=1165686679",
    ),
    OpsSheetTabPolicy(
        tab_name="선릉1",
        branch="SEOLLEUNG",
        building="",
        property_label="UH Suite 선릉",
        sheet_gid="627997160",
        sheet_url="https://docs.google.com/spreadsheets/d/1MfvPh2msnoXbG8Q2Mjpk5KVelh3Rv3HQ-SKt9P6xqjE/edit?gid=627997160#gid=627997160",
    ),
    OpsSheetTabPolicy(
        tab_name="강남",
        branch="GANGNAM",
        building="",
        property_label="UH Suite 강남",
        sheet_gid="1493215200",
        sheet_url="https://docs.google.com/spreadsheets/d/1MfvPh2msnoXbG8Q2Mjpk5KVelh3Rv3HQ-SKt9P6xqjE/edit?gid=1493215200#gid=1493215200",
    ),
)


def normalize_ops_sheet_spreadsheet(value: str) -> str:
    text = normalize_text(value)
    if not text:
        return DEFAULT_OPS_SHEET_SPREADSHEET
    return extract_sheet_id(text) or text


def resolve_ops_sheet_tab(branch: str, building: str) -> Optional[OpsSheetTabPolicy]:
    branch_key = normalize_text(branch).upper()
    building_key = normalize_text(building)
    for policy in DEFAULT_OPS_SHEET_TABS:
        if policy.branch != branch_key:
            continue
        if policy.building and policy.building != building_key:
            continue
        return policy
    return None


def format_ops_sheet_room_no(room_no: str) -> str:
    digits = "".join(ch for ch in normalize_text(room_no) if ch.isdigit())
    return digits or normalize_text(room_no)
