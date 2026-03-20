#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.domain.sheet_domain import ReservationBlock
from src.report.ops_workflow import build_ops_artifacts, build_ops_summary, write_ops_outputs


def parse_date(value: str) -> dt.date:
    return dt.date.fromisoformat(value)


def build_block(
    *,
    reservation_no: str,
    room_no: str,
    checkin: dt.date,
    checkout: dt.date,
    branch: str,
    channel: str,
    nationality_nights: str = "",
) -> ReservationBlock:
    nights = max((checkout - checkin).days, 1)
    return ReservationBlock(
        row=0,
        room_type="Urban Suite",
        room_no=room_no,
        start_col=0,
        end_col=max(nights - 1, 0),
        checkin=checkin,
        checkout=checkout,
        nights=nights,
        price=120000,
        note="",
        reservation_no=reservation_no,
        reservation_key=reservation_no,
        branch=branch,
        channel=channel,
        platform=channel,
        source_columns=list(range(nights)),
        nationality_nights=nationality_nights,
    )


def build_blocks(branch: str, start_date: dt.date) -> list[ReservationBlock]:
    if branch == "COEX":
        return [
            build_block(
                reservation_no="COEX-A",
                room_no="401",
                checkin=start_date,
                checkout=start_date + dt.timedelta(days=2),
                branch=branch,
                channel="NAVER",
                nationality_nights="한국 2박",
            ),
            build_block(
                reservation_no="COEX-B",
                room_no="A701",
                checkin=start_date + dt.timedelta(days=1),
                checkout=start_date + dt.timedelta(days=2),
                branch=branch,
                channel="BOOKING",
            ),
            build_block(
                reservation_no="COEX-C",
                room_no="508",
                checkin=start_date + dt.timedelta(days=2),
                checkout=start_date + dt.timedelta(days=4),
                branch=branch,
                channel="STATION",
            ),
        ]
    return [
        build_block(
            reservation_no="GN-A",
            room_no="1001",
            checkin=start_date,
            checkout=start_date + dt.timedelta(days=2),
            branch=branch,
            channel="NAVER",
        ),
        build_block(
            reservation_no="GN-B",
            room_no="1102",
            checkin=start_date + dt.timedelta(days=1),
            checkout=start_date + dt.timedelta(days=3),
            branch=branch,
            channel="BOOKING",
        ),
        build_block(
            reservation_no="GN-C",
            room_no="1203",
            checkin=start_date + dt.timedelta(days=2),
            checkout=start_date + dt.timedelta(days=4),
            branch=branch,
            channel="STATION",
        ),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build app_v2 ops preview artifacts.")
    parser.add_argument("--branch", required=True)
    parser.add_argument("--start-date", required=True)
    parser.add_argument("--end-date", required=True)
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    start_date = parse_date(args.start_date)
    end_date = parse_date(args.end_date)
    blocks = build_blocks(args.branch, start_date)
    artifacts = build_ops_artifacts(
        blocks,
        report_start=args.start_date,
        report_end=args.end_date,
    )
    out_dir = Path(args.out_dir)
    write_ops_outputs(out_dir, artifacts)
    summary = {
        "input": {
            "branch": args.branch,
            "start_date": args.start_date,
            "end_date": args.end_date,
            "reservation_blocks": len(blocks),
        },
        "derived_reports": build_ops_summary(artifacts),
    }
    (out_dir / "ops_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": True, "out_dir": str(out_dir), "branch": args.branch}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
