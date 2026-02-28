#!/usr/bin/env python
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEST_DIR = ROOT / "tests"


def run_test(test_path: Path) -> bool:
    if test_path.suffix == ".py":
        cmd = [sys.executable, str(test_path)]
    elif test_path.suffix == ".mjs":
        cmd = ["node", str(test_path)]
    else:
        return True

    result = subprocess.run(
        cmd,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    sys.stdout.write(result.stdout)
    return result.returncode == 0


def main() -> int:
    tests = sorted(TEST_DIR.glob("regression_*"))
    if not tests:
        print("No regression tests found.")
        return 1

    failed = []
    for test_path in tests:
        ok = run_test(test_path)
        if not ok:
            failed.append(test_path.name)

    if failed:
        print(f"FAILED: {', '.join(failed)}")
        return 1

    print(f"All regressions passed ({len(tests)}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
