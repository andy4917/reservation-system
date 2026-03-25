from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write_fixture() -> Path:
    rows = [
        {
            "source_system": "PMS",
            "reservation_no": "COEX-A",
            "channel": "NAVER",
            "checkin": "2026-03-20",
            "checkout": "2026-03-22",
            "nights": 2,
            "room_no": "401",
            "status": "RR",
            "status_bucket": "ACTIVE",
            "branch": "COEX",
        },
        {
            "source_system": "OTA",
            "reservation_no": "COEX-B",
            "channel": "AGODA",
            "checkin": "2026-03-21",
            "checkout": "2026-03-22",
            "nights": 1,
            "room_no": "A702",
            "status": "RR",
            "status_bucket": "ACTIVE",
            "branch": "COEX",
        },
    ]
    handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False)
    json.dump(rows, handle, ensure_ascii=False)
    handle.flush()
    handle.close()
    return Path(handle.name)


def run_action(action: str, fixture_path: Path) -> dict:
    return run_action_with_args(
        action,
        fixture_path,
        [],
    )


def run_action_with_args(action: str, fixture_path: Path, extra_args: list[str]) -> dict:
    result = subprocess.run(
        [
            "python3",
            str(ROOT / "scripts" / "app_v2_reservation_management_bridge.py"),
            action,
            "--branch",
            "COEX",
            "--start-date",
            "2026-03-20",
            "--end-date",
            "2026-03-24",
            "--fixture-mode",
            "--source-fixture",
            str(fixture_path),
            *extra_args,
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    return json.loads(result.stdout)


def main() -> None:
    fixture_path = write_fixture()

    compare_payload = run_action("compare", fixture_path)
    assert compare_payload["mode"] == "compare"
    assert compare_payload["engineStatus"] == "planned"
    assert compare_payload["issueCount"] > 0
    assert compare_payload["rows"]

    reconcile_payload = run_action("reconcile", fixture_path)
    assert reconcile_payload["mode"] == "reconcile"
    assert reconcile_payload["engineStatus"] == "planned"
    assert reconcile_payload["issueCount"] > 0
    assert reconcile_payload["rows"]

    apply_payload = run_action("apply", fixture_path)
    assert apply_payload["mode"] == "apply"
    assert apply_payload["engineStatus"] == "planned"
    assert apply_payload["planToken"]
    assert apply_payload["requiresApproval"] is True
    assert apply_payload["applyAllowed"] is False
    assert apply_payload["rows"]
    assert all(row["statusLabel"] == "DRYRUN" for row in apply_payload["rows"])

    executed_payload = run_action_with_args(
        "apply",
        fixture_path,
        ["--execute-apply", "--approve-plan-token", apply_payload["planToken"]],
    )
    assert executed_payload["mode"] == "apply"
    assert executed_payload["engineStatus"] == "applied"
    assert executed_payload["applyAllowed"] is True
    assert executed_payload["planToken"] == apply_payload["planToken"]
    assert executed_payload["rows"]
    assert all(row["statusLabel"] == "APPLIED" for row in executed_payload["rows"])
    assert "applyExecuted:true" in executed_payload["evidence"]

    print("regression_app_v2_management_bridge_py: OK")


if __name__ == "__main__":
    main()
