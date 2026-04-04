from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> None:
    spec = importlib.util.find_spec("inventory_cpp_core")
    assert spec is not None, "inventory_cpp_core module must exist"

    module = importlib.import_module("inventory_cpp_core")
    for attr in ("allocation_compute", "reconciliation_compute", "scan_compute", "drift_compute"):
        assert hasattr(module, attr), f"inventory_cpp_core missing required export: {attr}"

    print("regression_cpp_core_required_py: OK")


if __name__ == "__main__":
    main()
