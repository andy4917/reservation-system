from __future__ import annotations

import csv
import datetime as dt
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.domain.sheet_domain import AuditError, ReservationBlock
from src.report.ops_workflow import build_ops_artifacts, load_blocks_csv
from src.report.sheet_report import write_blocks_csv


def build_block(
    reservation_no: str,
    room_no: str,
    checkin: dt.date,
    checkout: dt.date,
    branch: str = "COEX",
    channel: str = "NAVER",
) -> ReservationBlock:
    nights = (checkout - checkin).days
    return ReservationBlock(
        row=0,
        room_type="Urban Spa Suite 6in",
        room_no=room_no,
        start_col=0,
        end_col=max(nights - 1, 0),
        checkin=checkin,
        checkout=checkout,
        nights=nights,
        price=100000,
        note="",
        reservation_no=reservation_no,
        reservation_key=reservation_no,
        branch=branch,
        channel=channel,
        platform=channel,
        source_columns=list(range(nights)),
        nationality_nights="한국 2박" if reservation_no == "COEX-B" else "",
    )


def main() -> None:
    blocks = [
        build_block("COEX-B", "401", dt.date(2026, 3, 5), dt.date(2026, 3, 7)),
        build_block("COEX-A", "A701", dt.date(2026, 3, 5), dt.date(2026, 3, 6), channel="BOOKING"),
        build_block("GN", "1001", dt.date(2026, 3, 4), dt.date(2026, 3, 8), branch="GANGNAM", channel="STATION"),
    ]

    with tempfile.TemporaryDirectory() as tmp:
        csv_path = Path(tmp) / "reservation_blocks.csv"
        write_blocks_csv(csv_path, blocks)
        with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            assert reader.fieldnames is not None
            assert "start_col_a1" in reader.fieldnames
            assert "end_col_a1" in reader.fieldnames
            assert "source_columns_a1" in reader.fieldnames
            first_row = next(reader)
            assert first_row["start_col_a1"] == "A"
            assert first_row["end_col_a1"] == "B"
            assert first_row["source_columns_a1"] == "A|B"
        loaded = load_blocks_csv(csv_path)
        assert len(loaded) == 3
        assert loaded[0].nationality_nights == "한국 2박"
        artifacts = build_ops_artifacts(
            loaded,
            report_date="2026-03-05",
            ops_sheet_spreadsheet="1MfvPh2msnoXbG8Q2Mjpk5KVelh3Rv3HQ-SKt9P6xqjE",
        )

        invalid_csv = Path(tmp) / "invalid_blocks.csv"
        invalid_csv.write_text(
            "row,room_type,room_no,start_col,end_col,checkin,checkout,nights,checkout_exclusive,price,branch,channel,reservation_no,platform,color_hex,source_columns,group_key,part_index,parts_total,month_split,note_head,nationality_nights\n"
            "1,Urban Spa Suite 6in,401,1,2,2026-03-05,2026-03-07,2,2026-03-07,100000,COEX,NAVER,COEX-B,NAVER,,1|2,,1,1,,,\n",
            encoding="utf-8-sig",
        )
        try:
            load_blocks_csv(invalid_csv)
            raise AssertionError("missing reservation_key should fail")
        except AuditError as exc:
            assert "missing required columns" in str(exc)

    assert artifacts["report_window"] == {"start": "2026-03-05", "end": "2026-03-05"}
    assert len(artifacts["orderlist_artifact"]["rows"]) == 3
    assert len(artifacts["arrival_artifact"]["rows"]) == 2
    order_tabs = {packet["tab_name"] for packet in artifacts["ops_sheet_bundle"]["orderlist_packets"]}
    arrival_templates = {packet["sheet_name"] for packet in artifacts["ops_sheet_bundle"]["arrival_packets"]}
    assert order_tabs == {"코엑스", "코엑스2", "강남"}
    assert arrival_templates == {"Arrival"}
    assert artifacts["ops_sheet_bundle"]["arrival_packets"][0]["grid_rows"]

    print("regression_ops_workflow_py: OK")


if __name__ == "__main__":
    main()
