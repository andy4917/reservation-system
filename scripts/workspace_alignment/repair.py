#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.lib.workspace_alignment import (
    archive_mirror_checkout,
    build_config,
    load_global_state,
    repair_global_state,
    save_global_state,
)


def main() -> None:
    config = build_config(ROOT)
    state = load_global_state(config.global_state_path)
    state_changed = repair_global_state(state, config)
    if state_changed:
        save_global_state(state, config.global_state_path)
    archive_error = None
    archived_path = None
    try:
        archived_path = archive_mirror_checkout(config.mirror_repo)
    except PermissionError as exc:
        archive_error = str(exc)
    print(
        json.dumps(
            {"state_changed": state_changed, "archived_mirror_checkout": str(archived_path) if archived_path else None, "archive_error": archive_error},
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
