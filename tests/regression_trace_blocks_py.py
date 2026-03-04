from __future__ import annotations

import contextlib
import datetime as dt
import io
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_audit import main
from src.domain.sheet_domain import ReservationBlock
from src.report.sheet_report import write_blocks_csv


def build_block() -> ReservationBlock:
    return ReservationBlock(
        row=66,
        room_type="Urban Spa Suite 6in",
        room_no="201",
        start_col=32,
        end_col=33,
        checkin=dt.date(2026, 1, 31),
        checkout=dt.date(2026, 2, 2),
        nights=2,
        price=300000,
        note="late arrival",
        reservation_no="AG-100",
        reservation_key="AG-100",
        branch="COEX",
        channel="AGODA",
        platform="AGODA",
        source_columns=[32, 33],
        nationality_nights="한국 2박",
    )


def main_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        blocks_csv = tmp_path / "reservation_blocks.csv"
        summary_json = tmp_path / "summary.json"
        write_blocks_csv(blocks_csv, [build_block()])
        summary_json.write_text(
            json.dumps(
                {
                    "input": {
                        "spreadsheet_id": "sheet123",
                        "sheet_name": "2026",
                    }
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = main(
                [
                    "trace-blocks",
                    "--blocks-csv",
                    str(blocks_csv),
                    "--reservation-key",
                    "AG-100",
                ]
            )
        assert rc == 0
        payload = json.loads(buf.getvalue())
        assert payload["count"] == 1
        assert payload["matches"][0]["sheet_name"] == "2026"
        assert payload["matches"][0]["start_col_a1"] == "AG"
        assert payload["matches"][0]["end_col_a1"] == "AH"
        assert payload["matches"][0]["sheet_range_a1"] == "'2026'!AG67:AH67"
        assert payload["matches"][0]["source_columns_a1"] == ["AG", "AH"]

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = main(
                [
                    "trace-blocks",
                    "--blocks-csv",
                    str(blocks_csv),
                    "--date",
                    "2026-02-01",
                ]
            )
        assert rc == 0
        payload = json.loads(buf.getvalue())
        assert payload["count"] == 1

    print("regression_trace_blocks_py: OK")


if __name__ == "__main__":
    main_test()
