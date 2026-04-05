#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
from urllib.parse import parse_qsl, urlparse


READONLY_RE = re.compile(r"/pms/biz/[^/]+/(?:search|select|view)[^/]*\.do$", re.I)
MUTATION_RE = re.compile(r"/pms/biz/[^/]+/(?:update|insert|delete|send)[^/]*\.do$", re.I)

CAPABILITY_HINTS = {
    "/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do": ("reservation_lookup", "reservation"),
    "/pms/biz/ir04_0100X/searchListGlobalRsvn_v03_SUM.do": ("reservation_summary", "reservation"),
    "/pms/biz/ir04_0200X_V03/searchListRsvn.do": ("reservation_lookup_local", "reservation"),
    "/pms/biz/ir01_0102/searchFITReserv.do": ("reservation_detail", "reservation"),
    "/pms/biz/fd01_0101/searchListLinkedReservation.do": ("linked_reservation_lookup", "reservation"),
    "/pms/biz/ir01_0300/searchListRoomBlockChart_V03.do": ("room_block_chart", "inventory"),
    "/pms/biz/ir01_0300/searchListRoomAvaiable.do": ("room_availability_chart", "inventory"),
    "/pms/biz/ir02_0100/searchListRoomAvailable.do": ("room_availability_summary", "inventory"),
    "/pms/biz/widget_onlinebookinglist/searchOnlineBookingList.do": ("online_booking_widget", "reservation"),
    "/pms/biz/comn/searchLangByNatCode.do": ("nationality_language_lookup", "guest"),
    "/pms/biz/ir04/searchListSource.do": ("source_catalog", "catalog"),
    "/pms/biz/ir04/searchListRoomType.do": ("room_type_catalog", "catalog"),
    "/pms/biz/ir04/searchListMarket.do": ("market_catalog", "catalog"),
    "/pms/biz/ir04/selectListRate.do": ("rate_catalog", "catalog"),
    "/pms/biz/ir04/selectListSalePerson.do": ("sale_person_catalog", "catalog"),
    "/pms/biz/comn02_0301/searchListAccountContract.do": ("account_contract_lookup", "account"),
    "/pms/biz/ir01_0102/searchListSpecialService.do": ("special_service_lookup", "reservation"),
    "/pms/biz/ir01_0111/searchRoomRateOnRsvn.do": ("reservation_rate_lookup", "reservation"),
    "/pms/biz/ir01_0124/searchGuestInfo.do": ("assigned_room_guest_info", "room_assignment"),
    "/pms/biz/ir01_0124/searchListAssignedRoom.do": ("assigned_room_lookup", "room_assignment"),
    "/pms/biz/ir01_0124/searchListRoom.do": ("assignable_room_lookup", "room_assignment"),
    "/pms/biz/ir01_0124/searchListRoomTypeByParam.do": ("assignable_room_type_lookup", "room_assignment"),
    "/pms/biz/ir01_0124/insertAssignedRoom.do": ("assigned_room_insert", "room_assignment"),
    "/pms/biz/ir01_0124/deleteAssignedRoom.do": ("assigned_room_delete", "room_assignment"),
    "/pms/biz/ir01_0300_V03/updateReservationProcessExpress.do": ("reservation_express_update", "reservation"),
    "/pms/biz/comn/sendBookingEngineAPI.do": ("booking_engine_send", "reservation"),
}

FILENAME_BRANCH_HINTS = (
    ("seolleung", "BRANCH_THE_SEOLLEUNG"),
    ("sl", "BRANCH_THE_SEOLLEUNG"),
    ("coex", "COEX"),
    ("gangnam", "GANGNAM"),
)

BRANCH_CODE_MAP = {
    "13": "COEX",
    "14": "BRANCH_THE_SEOLLEUNG",
    "91": "GANGNAM",
}


def _load_har_entries(path: Path) -> List[Dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("log", {}).get("entries", []) if isinstance(payload, dict) else []
    return [entry for entry in entries if isinstance(entry, dict)]


def _normalize_key(value: str) -> str:
    return re.sub(r"[^0-9a-zA-Z_]+", "_", str(value or "").strip()).strip("_").lower()


def _body_pairs(request: Dict[str, Any]) -> List[Tuple[str, str]]:
    post_data = request.get("postData") or {}
    text = str(post_data.get("text") or "")
    if not text:
      return []
    return [(key, value) for key, value in parse_qsl(text, keep_blank_values=True)]


def _try_json(text: str) -> Any | None:
    raw = str(text or "").strip()
    if not raw:
        return None
    candidates = [raw]
    if raw.startswith(")]}'"):
        candidates.append(raw[4:].lstrip())
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except Exception:
            continue
    return None


def _iter_objects(value: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from _iter_objects(item)
    elif isinstance(value, list):
        for item in value:
            yield from _iter_objects(item)


def _collect_row_keys(payload: Any) -> List[str]:
    if not isinstance(payload, dict):
        return []
    candidates = []
    for key in ("rows", "valueList", "items", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            candidates.extend(item for item in value if isinstance(item, dict))
        elif isinstance(value, dict):
            candidates.append(value)
    counter: Counter[str] = Counter()
    for row in candidates[:10]:
        for key in row.keys():
            normalized = _normalize_key(str(key))
            if normalized:
                counter[normalized] += 1
    return [key for key, _ in counter.most_common(30)]


def _classify_endpoint(path: str) -> Tuple[bool, str, str]:
    capability, group = CAPABILITY_HINTS.get(path, ("", ""))
    if MUTATION_RE.search(path):
        return False, capability or "mutation_unknown", group or "mutation"
    return True, capability or "readonly_unknown", group or "misc"


def analyze_hars(paths: List[Path]) -> Dict[str, Any]:
    endpoints: Dict[str, Dict[str, Any]] = {}
    for har_path in paths:
        file_branch = ""
        file_name = har_path.name.lower()
        for token, branch in FILENAME_BRANCH_HINTS:
            if token in file_name:
                file_branch = branch
                break
        for entry in _load_har_entries(har_path):
            request = entry.get("request") or {}
            response = entry.get("response") or {}
            url_text = str(request.get("url") or "")
            if "pms.sanhait.com" not in url_text:
                continue
            parsed = urlparse(url_text)
            path = parsed.path
            if not (READONLY_RE.search(path) or MUTATION_RE.search(path)):
                continue
            method = str(request.get("method") or "").upper() or "GET"
            request_pairs = list(parsed.query and parse_qsl(parsed.query, keep_blank_values=True) or [])
            request_pairs.extend(_body_pairs(request))
            branch_value = next(
                (value for key, value in request_pairs if key in {"PROPERTY_NO", "BSNS_CODE"} and value),
                "",
            )
            parsed_response = _try_json(((response.get("content") or {}).get("text") or ""))
            top_level_keys = (
                sorted({_normalize_key(key) for key in parsed_response.keys() if _normalize_key(key)})[:20]
                if isinstance(parsed_response, dict)
                else []
            )
            row_keys = _collect_row_keys(parsed_response)
            request_keys = sorted({_normalize_key(key) for key, _ in request_pairs if key})[:40]
            endpoint = endpoints.setdefault(
                path,
                {
                    "path": path,
                    "methods": Counter(),
                    "branches": set(),
                    "request_keys": Counter(),
                    "response_top_level_keys": Counter(),
                    "response_row_keys": Counter(),
                    "statuses": Counter(),
                    "files": set(),
                },
            )
            endpoint["methods"][method] += 1
            endpoint["statuses"][int(response.get("status") or 0)] += 1
            endpoint["files"].add(har_path.name)
            if file_branch:
                endpoint["branches"].add(file_branch)
            mapped_branch = BRANCH_CODE_MAP.get(branch_value)
            if mapped_branch:
                endpoint["branches"].add(mapped_branch)
            for key in request_keys:
                endpoint["request_keys"][key] += 1
            for key in top_level_keys:
                endpoint["response_top_level_keys"][key] += 1
            for key in row_keys:
                endpoint["response_row_keys"][key] += 1

    normalized = []
    for path, meta in sorted(endpoints.items()):
        read_only, capability, group = _classify_endpoint(path)
        normalized.append(
            {
                "path": path,
                "read_only": read_only,
                "capability": capability,
                "group": group,
                "methods": dict(meta["methods"]),
                "statuses": dict(meta["statuses"]),
                "branches": sorted(meta["branches"]),
                "files": sorted(meta["files"]),
                "request_keys": [key for key, _ in meta["request_keys"].most_common(30)],
                "response_top_level_keys": [key for key, _ in meta["response_top_level_keys"].most_common(20)],
                "response_row_keys": [key for key, _ in meta["response_row_keys"].most_common(30)],
            }
        )

    return {
        "har_files": [path.name for path in paths],
        "endpoint_count": len(normalized),
        "readonly_count": sum(1 for item in normalized if item["read_only"]),
        "mutation_count": sum(1 for item in normalized if not item["read_only"]),
        "endpoints": normalized,
    }


def render_markdown(report: Dict[str, Any]) -> str:
    lines = [
        "# Wings HAR Endpoint Catalog",
        "",
        f"- endpoint_count: {report['endpoint_count']}",
        f"- readonly_count: {report['readonly_count']}",
        f"- mutation_count: {report['mutation_count']}",
        "",
        "| Path | Capability | Read-only | Branches |",
        "| --- | --- | --- | --- |",
    ]
    for endpoint in report["endpoints"]:
        lines.append(
            f"| `{endpoint['path']}` | `{endpoint['capability']}` | "
            f"`{'Y' if endpoint['read_only'] else 'N'}` | `{','.join(endpoint['branches']) or '-'}` |"
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze Wings PMS HAR files and summarize endpoint structure.")
    parser.add_argument("har_paths", nargs="+", help="Paths to HAR files")
    parser.add_argument("--json-out", dest="json_out", help="Write JSON report to this file")
    parser.add_argument("--md-out", dest="md_out", help="Write Markdown report to this file")
    args = parser.parse_args()

    report = analyze_hars([Path(path).resolve() for path in args.har_paths])
    if args.json_out:
        json_path = Path(args.json_out).resolve()
        json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.md_out:
        md_path = Path(args.md_out).resolve()
        md_path.write_text(render_markdown(report), encoding="utf-8")
    if not args.json_out and not args.md_out:
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
