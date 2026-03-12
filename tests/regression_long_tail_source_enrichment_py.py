from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_audit import enrich_long_tail_candidates_with_source_records
from src.domain.sheet_domain import SourceReservation


def main() -> None:
    candidates = [
        {
            "reason": "OCCUPIED_UNKNOWN_CHANNEL",
            "date": "2026-03-06",
            "room_no": "601",
            "channel": "UNKNOWN",
            "candidate_channel": "",
            "reservation_no": "2370970080",
            "note_head": "8인 - 정민 예약번호 : 2370970080 예약자 : test"
        }
    ]
    source_records = [
        SourceReservation(
            source_system="PMS",
            reservation_no="26177827",
            reservation_ref="2370970080",
            channel="EXPEDIA",
            checkin=dt.date(2026, 3, 6),
            checkout=dt.date(2026, 3, 8),
            nights=2,
            room_no="601",
        )
    ]
    enriched = enrich_long_tail_candidates_with_source_records(candidates, source_records)
    assert enriched[0]["candidate_channel"] == "EXPEDIA"
    assert enriched[0]["candidate_basis"] == "reservation_ref"
    print("regression_long_tail_source_enrichment_py: OK")


if __name__ == "__main__":
    main()
