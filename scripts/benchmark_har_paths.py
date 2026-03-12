from __future__ import annotations

import argparse
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reservation_sheet_audit import parse_har_records, parse_source_reservations_from_har
from src.io.har_cache import load_har_entries, reset_har_cache


def _measure(label: str, fn, iterations: int) -> tuple[str, float, float, object]:
    durations = []
    last_result = None
    for _ in range(iterations):
        started = time.perf_counter()
        last_result = fn()
        durations.append((time.perf_counter() - started) * 1000.0)
    return label, statistics.mean(durations), min(durations), last_result


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark HAR cache and parser hot paths.")
    parser.add_argument("har_path", help="Path to a HAR file")
    parser.add_argument("--iterations", type=int, default=5)
    args = parser.parse_args()

    har_path = Path(args.har_path).resolve()
    if not har_path.exists():
        raise SystemExit(f"HAR file not found: {har_path}")

    iterations = max(int(args.iterations), 1)

    reset_har_cache()
    cold = _measure("load_har_entries_cold", lambda: load_har_entries(har_path), 1)
    warm = _measure("load_har_entries_warm", lambda: load_har_entries(har_path), iterations)
    source_parse = _measure(
        "parse_source_reservations_from_har",
        lambda: parse_source_reservations_from_har(har_path),
        iterations,
    )
    script_parse = _measure("parse_har_records", lambda: parse_har_records(har_path), iterations)

    print(f"HAR: {har_path}")
    print(f"Iterations: {iterations}")
    print("")
    print(f"{cold[0]} mean_ms={cold[1]:.2f} min_ms={cold[2]:.2f} entries={len(cold[3])}")
    print(f"{warm[0]} mean_ms={warm[1]:.2f} min_ms={warm[2]:.2f} entries={len(warm[3])}")
    print(
        f"{source_parse[0]} mean_ms={source_parse[1]:.2f} min_ms={source_parse[2]:.2f} "
        f"records={len(source_parse[3])}"
    )
    print(
        f"{script_parse[0]} mean_ms={script_parse[1]:.2f} min_ms={script_parse[2]:.2f} "
        f"records={len(script_parse[3])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
