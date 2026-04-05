#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path(__file__).resolve().parents[1]
SYNC_SCRIPT = ROOT / "reservation_sheet_sync.py"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run OTA apply dry-run/apply for app_v2.")
    parser.add_argument("--branch", required=True)
    parser.add_argument("--spreadsheet", default="")
    parser.add_argument("--sheet-name", default="")
    parser.add_argument("--start-date", required=True)
    parser.add_argument("--end-date", required=True)
    parser.add_argument("--provider", choices=["station", "naver", "both"], default="both")
    parser.add_argument("--auth-bundle-file", default="")
    parser.add_argument("--approve-plan-token", default="")
    parser.add_argument("--execute-apply", action="store_true")
    parser.add_argument("--naver-business-id", default="")
    parser.add_argument("--station-branch-id", default="")
    parser.add_argument("--out-dir", default="")
    return parser.parse_args()


def run_sync_inventory(args: argparse.Namespace, out_dir: Path) -> Dict[str, Any]:
    cmd = [
        sys.executable,
        str(SYNC_SCRIPT),
        "--spreadsheet",
        str(args.spreadsheet or ""),
        "--sheet-name",
        str(args.sheet_name or ""),
        "--provider",
        str(args.provider or "both"),
        "--sync-start-date",
        str(args.start_date),
        "--sync-end-date",
        str(args.end_date),
        "--out-dir",
        str(out_dir),
    ]
    if args.auth_bundle_file:
        cmd.extend(["--auth-bundle-file", str(args.auth_bundle_file)])
    if args.naver_business_id:
        cmd.extend(["--naver-business-id", str(args.naver_business_id)])
    if args.station_branch_id:
        cmd.extend(["--station-branch-id", str(args.station_branch_id)])
    if args.approve_plan_token:
        cmd.extend(["--approve-plan-token", str(args.approve_plan_token)])
    result = subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"sync inventory failed: {result.returncode}")
    summary_path = out_dir / "sync_inventory_summary.json"
    if not summary_path.exists():
        raise RuntimeError("sync_inventory_summary.json was not created")
    return json.loads(summary_path.read_text(encoding="utf-8"))


def build_action_rows(summary: Dict[str, Any], provider: str) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    include_station = provider in ("station", "both")
    include_naver = provider in ("naver", "both")

    if include_station:
        for index, action in enumerate((summary.get("station") or {}).get("effective_actions") or (summary.get("station") or {}).get("actions") or []):
            rows.append(
                {
                    "id": f"station-{index}",
                    "primary": f"Station / {str(action.get('date') or '-')}",
                    "secondary": f"mismatch {int(action.get('mismatchCount') or 0)} · room {len((action.get('payload') or {}).get('roomSettingStocks') or [])}",
                    "statusLabel": "STATION_APPLY" if action.get("hasChange") else "STATION_SKIP",
                    "detail": "OTA 관리 페이지 재고 반영",
                }
            )

    if include_naver:
        for index, action in enumerate((summary.get("naver") or {}).get("effective_actions") or (summary.get("naver") or {}).get("actions") or []):
            rows.append(
                {
                    "id": f"naver-{index}",
                    "primary": f"Naver / {str(action.get('bizItemId') or '-')} / {str(action.get('date') or '-')}",
                    "secondary": str(action.get("type") or "stock"),
                    "statusLabel": "NAVER_APPLY",
                    "detail": "OTA 관리 페이지 재고 반영",
                }
            )
    return rows


def build_payload(args: argparse.Namespace, summary: Dict[str, Any]) -> Dict[str, Any]:
    planner = summary.get("inventory_planner") or {}
    stages = planner.get("stages") or {}
    approve = stages.get("approve") or {}
    rows = build_action_rows(summary, str(args.provider or "both"))
    planned_actions = int((planner.get("totals") or {}).get("planned_actions", len(rows)))
    policy = summary.get("policy") or {}
    blocked_issues = policy.get("issues") or []
    required_token = str(approve.get("required_token") or "")
    approval_match = bool(required_token and args.approve_plan_token and args.approve_plan_token == required_token)
    apply_allowed = bool((not policy.get("blocked")) and ((not approve.get("required")) or approval_match))
    summary_text = (
        f"OTA 관리 반영 가능 상태를 확인했습니다. {planned_actions}건 범위를 계산했습니다."
        if apply_allowed
        else f"OTA 관리 반영 dry-run {planned_actions}건을 계산했습니다."
    )
    return {
        "mode": "apply",
        "branch": str(args.branch),
        "checkedAt": str(summary.get("checkedAt") or summary.get("checked_at") or ""),
        "engineStatus": "planned",
        "summary": summary_text,
        "issueCount": len(rows),
        "rows": rows,
        "evidence": [
            f"provider:{args.provider}",
            f"sheet:{'set' if args.spreadsheet else 'missing'}",
            f"sheetName:{'set' if args.sheet_name else 'missing'}",
            f"blockedIssues:{len(blocked_issues)}",
            f"plannedActions:{planned_actions}",
        ],
        "planToken": required_token,
        "requiresApproval": bool(approve.get("required")),
        "applyAllowed": apply_allowed,
    }


def main() -> int:
    args = parse_args()
    if not args.spreadsheet or not args.sheet_name:
        raise RuntimeError("spreadsheet and sheet-name are required")
    if not args.auth_bundle_file:
        raise RuntimeError("auth-bundle-file is required")
    out_dir = Path(args.out_dir) if str(args.out_dir or "").strip() else Path(tempfile.mkdtemp(prefix="uhs-app-v2-ota-apply-"))
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = run_sync_inventory(args, out_dir)

    print(json.dumps(build_payload(args, summary), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)
