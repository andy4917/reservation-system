from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    source = (ROOT / "scripts" / "app_v2_live_sheet_bridge.py").read_text(encoding="utf-8")
    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    assert "rapidfuzz" in pyproject or "rapidfuzz" in source
    assert "searchBundles" in source
    assert "candidateFeatures" in source
    assert "contradictionFlags" in source
    assert "samePhone" in source or "same_phone" in source
    assert "sameGuestName" in source or "same_guest_name" in source
    assert "guestNameSimilarity" in source or "guest_name_similarity" in source
    assert "noteHeadSimilarity" in source or "note_head_similarity" in source
    assert "same_reservation_no" in source
    assert "room_change_blocker" in source
    print("regression_app_v2_hybrid_candidate_engine_py: OK")


if __name__ == "__main__":
    main()
