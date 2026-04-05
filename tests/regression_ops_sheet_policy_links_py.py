from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.domain.ops_sheet_policy import DEFAULT_OPS_SHEET_SPREADSHEET, DEFAULT_OPS_SHEET_TABS, resolve_ops_sheet_tab


def main() -> None:
    assert DEFAULT_OPS_SHEET_SPREADSHEET == "1MfvPh2msnoXbG8Q2Mjpk5KVelh3Rv3HQ-SKt9P6xqjE"

    tabs = {item.tab_name: item for item in DEFAULT_OPS_SHEET_TABS}
    assert "코엑스" in tabs
    assert "코엑스2" in tabs
    assert "선릉1" in tabs
    assert "강남" in tabs

    seolleung = resolve_ops_sheet_tab("SEOLLEUNG", "")
    assert seolleung is not None
    assert seolleung.tab_name == "선릉1"
    assert seolleung.sheet_gid == "627997160"

    print("regression_ops_sheet_policy_links_py: OK")


if __name__ == "__main__":
    main()
