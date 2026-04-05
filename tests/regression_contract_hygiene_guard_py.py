from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "check_contract_hygiene.py"), "--cwd", str(ROOT), "--json"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    payload = json.loads(result.stdout)
    assert payload["finding_count"] == 0, payload
    print("regression_contract_hygiene_guard_py: OK")


if __name__ == "__main__":
    main()
