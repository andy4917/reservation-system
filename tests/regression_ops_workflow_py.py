from __future__ import annotations

import datetime as dt
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.domain.sheet_domain import ReservationBlock
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
    return ReservationBlock(
        row=0,
        room_type="Urban Spa Suite 6in",
        room_no=room_no,
        start_col=0,
        end_col=0,
        checkin=checkin,
        checkout=checkout,
        nights=(checkout - checkin).days,
        price=100000,
        note="",
        reservation_no=reservation_no,
        reservation_key=reservation_no,
        branch=branch,
        channel=channel,
        platform=channel,
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
        loaded = load_blocks_csv(csv_path)
        assert len(loaded) == 3
        artifacts = build_ops_artifacts(
            loaded,
            report_date="2026-03-05",
            ops_sheet_spreadsheet="1MfvPh2msnoXbG8Q2Mjpk5KVelh3Rv3HQ-SKt9P6xqjE",
        )

    assert artifacts["report_window"] == {"start": "2026-03-05", "end": "2026-03-05"}
    assert len(artifacts["orderlist_artifact"]["rows"]) == 3
    assert len(artifacts["arrival_artifact"]["rows"]) == 2
    order_tabs = {packet["tab_name"] for packet in artifacts["ops_sheet_bundle"]["orderlist_packets"]}
    arrival_tabs = {packet["tab_name"] for packet in artifacts["ops_sheet_bundle"]["arrival_packets"]}
    assert order_tabs == {"코엑스", "코엑스2", "강남"}
    assert arrival_tabs == {"코엑스", "코엑스2"}

    print("regression_ops_workflow_py: OK")


if __name__ == "__main__":
    main()
