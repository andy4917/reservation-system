from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        endpoint_report = tmp_path / "endpoints.json"
        branch_mapping = tmp_path / "branches.json"
        output = tmp_path / "matrix.json"

        endpoint_report.write_text(
            json.dumps(
                {
                    "endpoints": [
                        {
                            "path": "/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do",
                            "capability": "reservation_lookup",
                            "group": "reservation",
                            "read_only": True,
                            "branches": ["COEX", "GANGNAM"],
                            "request_keys": ["property_no", "bsns_code"],
                            "response_top_level_keys": ["rows", "resultcd"],
                            "response_row_keys": ["rsvn_no_hid", "nat_code", "account"],
                        },
                        {
                            "path": "/pms/biz/comn/searchLangByNatCode.do",
                            "capability": "nationality_language_lookup",
                            "group": "guest",
                            "read_only": True,
                            "branches": ["COEX", "GANGNAM"],
                            "request_keys": ["property_no", "nat_code"],
                            "response_top_level_keys": ["rows", "resultcd"],
                            "response_row_keys": ["nat_code", "lang_code", "lang_name"],
                        },
                        {
                            "path": "/pms/biz/ir01_0124/insertAssignedRoom.do",
                            "capability": "assigned_room_insert",
                            "group": "room_assignment",
                            "read_only": False,
                            "branches": ["GANGNAM"],
                            "request_keys": ["property_no", "rsvn_no"],
                            "response_top_level_keys": ["resultcd"],
                            "response_row_keys": [],
                        },
                        {
                            "path": "/pms/biz/fd00/searchRoomNoLength.do",
                            "capability": "readonly_unknown",
                            "group": "misc",
                            "read_only": True,
                            "branches": ["COEX", "GANGNAM"],
                            "request_keys": ["property_no"],
                            "response_top_level_keys": ["rows"],
                            "response_row_keys": ["property_no"],
                        },
                    ]
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        branch_mapping.write_text(
            json.dumps(
                {
                    "branches": [
                        {"branch": "COEX", "display_name": "더 코엑스"},
                        {"branch": "GANGNAM", "display_name": "강남"},
                    ]
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "build_wings_capability_matrix.py"),
                "--endpoint-report",
                str(endpoint_report),
                "--branch-mapping",
                str(branch_mapping),
                "--output",
                str(output),
            ],
            cwd=str(ROOT),
            check=True,
        )

        matrix = json.loads(output.read_text(encoding="utf-8"))
        assert matrix["capability_count"] == 3
        by_name = {row["capability"]: row for row in matrix["capabilities"]}
        assert "readonly_unknown" not in by_name
        assert by_name["reservation_lookup"]["paths"] == ["/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do"]
        assert by_name["reservation_lookup"]["branches"][0]["branch"] == "COEX"
        assert by_name["nationality_language_lookup"]["response_row_keys"] == ["lang_code", "lang_name", "nat_code"]
        assert by_name["assigned_room_insert"]["read_only"] is False

    print("regression_wings_capability_matrix_py: OK")


if __name__ == "__main__":
    main()
