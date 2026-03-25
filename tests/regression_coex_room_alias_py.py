#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.scan.sheet_scan import build_room_identity, room_no_alias_keys
from src.reconcile.sheet_reconcile import room_alias_keys


def main() -> None:
    alias_b401 = set(room_no_alias_keys("B401"))
    assert {"B401", "401"} <= alias_b401

    alias_b112 = set(room_no_alias_keys("B112"))
    assert {"B112", "1102"} <= alias_b112
    assert "112" not in alias_b112
    reconcile_b112 = room_alias_keys("B112")
    assert "112" not in reconcile_b112

    alias_a302 = set(room_no_alias_keys("A302"))
    assert {"A302", "1302"} <= alias_a302
    reconcile_a302 = room_alias_keys("A302")
    assert "1302" in reconcile_a302
    assert "2302" not in reconcile_a302

    alias_a121 = set(room_no_alias_keys("A121"))
    assert {"A121", "2201"} <= alias_a121
    assert "1121" not in alias_a121
    reconcile_a121 = room_alias_keys("A121")
    assert "1121" not in reconcile_a121

    assert build_room_identity("COEX", "B112").pms_room_no == "1102"
    assert build_room_identity("COEX", "A121").pms_room_no == "2201"

    reconcile_2201 = room_alias_keys("2201")
    assert {"2201", "A121"} <= reconcile_2201

    reconcile_1102 = room_alias_keys("1102")
    assert {"1102", "B112"} <= reconcile_1102

    print("regression_coex_room_alias_py: OK")


if __name__ == "__main__":
    main()
