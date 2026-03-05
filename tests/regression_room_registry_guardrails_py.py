from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_audit import (
    build_room_registry_artifact,
    evaluate_room_registry_schema_lock,
    write_room_registry_snapshot_artifact,
)
from src.domain.sheet_domain import RoomRow


def build_room(
    *,
    row: int,
    canonical_id: str,
    sheet_room_no: str,
    building: str,
    room_number: str,
    pms_room_no: str,
    branch: str = "COEX",
) -> RoomRow:
    return RoomRow(
        row=row,
        room_type="Urban Spa Suite 6in",
        room_no=sheet_room_no,
        capacity=6,
        branch=branch,
        building=building,
        room_number=room_number,
        sheet_room_no=sheet_room_no,
        canonical_id=canonical_id,
        pms_room_no=pms_room_no,
        room_type_source="explicit",
        raw_text="",
    )


def main() -> None:
    room_rows = {
        0: build_room(
            row=0,
            canonical_id="COEX-B-1301",
            sheet_room_no="1301",
            building="B",
            room_number="1301",
            pms_room_no="1301",
        ),
        1: build_room(
            row=1,
            canonical_id="COEX-B-1201",
            sheet_room_no="B1201",
            building="B",
            room_number="1201",
            pms_room_no="1201",
        ),
        2: build_room(
            row=2,
            canonical_id="COEX-A-301",
            sheet_room_no="A301",
            building="A",
            room_number="301",
            pms_room_no="1301",
        ),
        3: build_room(
            row=3,
            canonical_id="COEX-A-301",
            sheet_room_no="A301",
            building="A",
            room_number="301",
            pms_room_no="1302",
        ),
        4: build_room(
            row=4,
            canonical_id="COEX-B-301",
            sheet_room_no="301",
            building="B",
            room_number="301",
            pms_room_no="301",
        ),
        5: build_room(
            row=5,
            canonical_id="COEX-B-302",
            sheet_room_no="302",
            building="B",
            room_number="302",
            pms_room_no="301",
        ),
    }

    artifact = build_room_registry_artifact(room_rows)
    issue_types = {row.get("issue_type") for row in artifact["identity_issues"]}
    assert "BUILDING_RANGE_VIOLATION" in issue_types
    assert "INVALID_PATTERN" in issue_types
    assert "PMS_CANONICAL_COLLISION" in issue_types
    assert "PMS_ROOM_NO_COLLISION" in issue_types
    assert int(artifact["counts"].get("pms_room_no_collisions", 0)) >= 2
    assert int(artifact["counts"].get("building_range_violations", 0)) >= 1
    assert int(artifact["counts"].get("invalid_patterns", 0)) >= 1

    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp)
        snapshot1 = write_room_registry_snapshot_artifact(
            out_dir,
            spreadsheet_id="sheet-1",
            sheet_name="2026-03",
            registry_rows=artifact["rows"],
        )
        assert snapshot1["diff"]["counts"] == {"added": 5, "removed": 0, "moved": 0}

        args_init = argparse.Namespace(
            room_registry_baseline=str(out_dir / "room_registry_baseline.json"),
            room_registry_baseline_init=True,
        )
        schema1 = evaluate_room_registry_schema_lock(args_init, out_dir, snapshot1["current"])
        assert schema1["status"] in {"initialized", "reset"}
        assert schema1["warning"] is False

        rows2 = [dict(row) for row in artifact["rows"] if row.get("canonical_id") != "COEX-B-302"]
        for row in rows2:
            if row.get("canonical_id") == "COEX-B-301":
                row["pms_room_no"] = "999"
                row["branch"] = "SEOLLEUNG"
        rows2.append(
            {
                "branch": "COEX",
                "building": "A",
                "room_number": "999",
                "sheet_room_no": "A999",
                "canonical_id": "COEX-A-999",
                "pms_room_no": "1999",
                "sheet_rows": "100",
                "sheet_row_first": 100,
            }
        )

        snapshot2 = write_room_registry_snapshot_artifact(
            out_dir,
            spreadsheet_id="sheet-1",
            sheet_name="2026-03",
            registry_rows=rows2,
        )
        assert snapshot2["diff"]["counts"] == {"added": 1, "removed": 1, "moved": 1}

        args_check = argparse.Namespace(
            room_registry_baseline=str(out_dir / "room_registry_baseline.json"),
            room_registry_baseline_init=False,
        )
        schema2 = evaluate_room_registry_schema_lock(args_check, out_dir, snapshot2["current"])
        assert schema2["status"] == "checked"
        assert schema2["warning"] is True
        assert schema2["diff"]["counts"] == {"added": 1, "removed": 1, "moved": 1}
        assert schema2["topology"]["counts"]["branches_changed"] == 2
        by_branch = {row["branch"]: row for row in schema2["topology"]["branch_deltas"]}
        assert by_branch["COEX"]["delta"] == -1
        assert by_branch["SEOLLEUNG"]["delta"] == 1

    print("regression_room_registry_guardrails_py: OK")


if __name__ == "__main__":
    main()
