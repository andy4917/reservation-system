from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_sync import (
    build_provider_reconciliation,
    summarize_naver_action_stats_by_date,
    summarize_naver_actual_units_by_date,
    summarize_station_action_stats_by_date,
    summarize_station_actual_units_by_date,
)


def main() -> None:
    station_rows = [
        {"date": "2026-03-01", "roomId": "1", "stockCount": 1},
        {"date": "2026-03-01", "roomId": "2", "stockCount": 0},
        {"date": "2026-03-02", "roomId": "1", "stockCount": 1},
    ]
    station_actual = summarize_station_actual_units_by_date(station_rows, ["1", "2"])
    assert station_actual == {"2026-03-01": 1, "2026-03-02": 1}

    station_actions = [
        {"date": "2026-03-01", "hasChange": True, "mismatchCount": 1},
        {"date": "2026-03-02", "hasChange": False, "mismatchCount": 0},
    ]
    station_stats = summarize_station_action_stats_by_date(station_actions)
    assert station_stats["2026-03-01"]["action_count"] == 1
    assert station_stats["2026-03-01"]["change_actions"] == 1
    assert station_stats["2026-03-01"]["mismatch_signals"] == 1

    station_recon = build_provider_reconciliation(
        "STATION",
        {"2026-03-01": 2, "2026-03-02": 1},
        station_actual,
        station_stats,
    )
    assert station_recon["counts"]["dates"] == 2
    assert station_recon["counts"]["drift_dates"] == 1
    assert station_recon["counts"]["action_dates"] == 1

    naver_current_by_room = {
        "A": {
            "2026-03-01": {"stock": 1, "isSaleDay": True},
            "2026-03-02": {"stock": 0, "isSaleDay": False},
        },
        "B": {
            "2026-03-01": {"stock": 1, "isSaleDay": True},
            "2026-03-02": {"stock": 1, "isSaleDay": True},
        },
    }
    naver_actual = summarize_naver_actual_units_by_date(naver_current_by_room, ["A", "B"])
    assert naver_actual == {"2026-03-01": 2, "2026-03-02": 1}

    naver_actions = [
        {"type": "stock", "date": "2026-03-01", "countAsMismatch": True},
        {"type": "sale-day", "date": "2026-03-01", "countAsMismatch": True},
        {"type": "stock", "date": "2026-03-02", "countAsMismatch": False},
    ]
    naver_stats = summarize_naver_action_stats_by_date(naver_actions)
    assert naver_stats["2026-03-01"]["stock_actions"] == 1
    assert naver_stats["2026-03-01"]["sale_day_actions"] == 1
    assert naver_stats["2026-03-02"]["mismatch_signals"] == 0

    naver_recon = build_provider_reconciliation(
        "NAVER",
        {"2026-03-01": 2, "2026-03-02": 2},
        naver_actual,
        naver_stats,
    )
    assert naver_recon["counts"]["drift_dates"] == 1
    assert naver_recon["counts"]["actions"] == 3

    print("regression_sync_reconciliation_py: OK")


if __name__ == "__main__":
    main()
