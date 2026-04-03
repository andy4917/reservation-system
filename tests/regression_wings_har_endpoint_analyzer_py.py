from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def build_sample_har() -> dict:
    return {
        "log": {
            "entries": [
                {
                    "request": {
                        "method": "POST",
                        "url": "https://pms.sanhait.com/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do",
                        "postData": {
                            "text": "PROPERTY_NO=91&BSNS_CODE=91&ARRV_DATE_F=20260312&ARRV_DATE_T=20260331"
                        },
                    },
                    "response": {
                        "status": 200,
                        "content": {
                            "text": json.dumps(
                                {
                                    "rows": [
                                        {
                                            "RSVN_NO": "25150113",
                                            "ARRV_DATE": "20260321",
                                            "DEPT_DATE": "20260325",
                                            "NAT_CODE": "USA",
                                            "LANG_NAME": "English",
                                        }
                                    ],
                                    "resultCd": "00",
                                },
                                ensure_ascii=False,
                            )
                        },
                    },
                },
                {
                    "request": {
                        "method": "POST",
                        "url": "https://pms.sanhait.com/pms/biz/ir01_0124/insertAssignedRoom.do",
                        "postData": {
                            "text": "PROPERTY_NO=91&BSNS_CODE=91&RSVN_NO=25150113&ROOM_NO=0401"
                        },
                    },
                    "response": {
                        "status": 200,
                        "content": {
                            "text": json.dumps({"resultCd": "00", "resultMsg": "정상처리 되었습니다."}, ensure_ascii=False)
                        },
                    },
                },
            ]
        }
    }


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        har_path = tmp_path / "pms.sanhait.com.ACCOUNT gangnam.har"
        seolleung_har_path = tmp_path / "pms.sanhait.com.ACCOUNT sl.har"
        json_out = tmp_path / "report.json"
        md_out = tmp_path / "report.md"
        har_path.write_text(json.dumps(build_sample_har(), ensure_ascii=False), encoding="utf-8")
        seolleung_har = build_sample_har()
        seolleung_har["log"]["entries"][0]["request"]["postData"]["text"] = (
            "PROPERTY_NO=14&BSNS_CODE=14&ARRV_DATE_F=20260312&ARRV_DATE_T=20260331"
        )
        seolleung_har["log"]["entries"][1]["request"]["postData"]["text"] = (
            "PROPERTY_NO=14&BSNS_CODE=14&RSVN_NO=25150113&ROOM_NO=0401"
        )
        seolleung_har_path.write_text(json.dumps(seolleung_har, ensure_ascii=False), encoding="utf-8")

        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "analyze_wings_har_endpoints.py"),
                str(har_path),
                str(seolleung_har_path),
                "--json-out",
                str(json_out),
                "--md-out",
                str(md_out),
            ],
            cwd=str(ROOT),
            check=True,
        )

        report = json.loads(json_out.read_text(encoding="utf-8"))
        assert report["endpoint_count"] == 2
        by_path = {row["path"]: row for row in report["endpoints"]}
        assert by_path["/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do"]["read_only"] is True
        assert by_path["/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do"]["capability"] == "reservation_lookup"
        assert "nat_code" in by_path["/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do"]["response_row_keys"]
        assert by_path["/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do"]["branches"] == ["BRANCH_THE_SEOLLEUNG", "GANGNAM"]
        assert by_path["/pms/biz/ir01_0124/insertAssignedRoom.do"]["read_only"] is False
        assert by_path["/pms/biz/ir01_0124/insertAssignedRoom.do"]["capability"] == "assigned_room_insert"
        assert by_path["/pms/biz/ir01_0124/insertAssignedRoom.do"]["branches"] == ["BRANCH_THE_SEOLLEUNG", "GANGNAM"]
        markdown = md_out.read_text(encoding="utf-8")
        assert "| `/pms/biz/ir01_0124/insertAssignedRoom.do` | `assigned_room_insert` | `N` | `BRANCH_THE_SEOLLEUNG,GANGNAM` |" in markdown
        assert "| `/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do` | `reservation_lookup` | `Y` | `BRANCH_THE_SEOLLEUNG,GANGNAM` |" in markdown

    print("regression_wings_har_endpoint_analyzer_py: OK")


if __name__ == "__main__":
    main()
