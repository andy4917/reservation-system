#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.lib.workspace_alignment import build_alignment_report, build_config, evaluate_alignment


def main() -> None:
    config = build_config(ROOT)
    report = build_alignment_report(config)
    verdict = evaluate_alignment(report, config)
    print(json.dumps({"report": report, "verdict": verdict}, ensure_ascii=False, indent=2))
    raise SystemExit(0 if verdict["ok"] else 1)


if __name__ == "__main__":
    main()
