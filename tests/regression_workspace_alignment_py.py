from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.lib.workspace_alignment import (  # type: ignore[attr-defined]
    AlignmentConfig,
    archive_mirror_checkout,
    evaluate_alignment,
    repair_global_state,
)


def build_test_config() -> AlignmentConfig:
    return AlignmentConfig(
        repo_root=Path("/repo/reservation-system"),
        mirror_repo=Path("/workspace/mirrors/reservation-system"),
        global_state_path=Path("/workspace/codex/.codex-global-state.json"),
        canonical_active_roots=(
            r"\\wsl$\Distro\repo\reservation-system",
            r"\\wsl.localhost\Distro\repo\reservation-system",
        ),
        stale_saved_root=r"X:\workspace\mirrors\reservation-system",
        stale_open_target_path="/workspace/mirrors/reservation-system",
    )


def test_evaluate_alignment_flags_divergent_standalone_mirror() -> None:
    config = build_test_config()
    report = {
        "canonical_repo": {
            "exists": True,
            "head": "abc123",
            "branch": "work/runtime-update",
            "remote_origin": "git@github.com:andy4917/reservation-system.git",
            "status_count": 100,
            "git_dir_inside_repo": True,
        },
        "mirror_repo": {
            "exists": True,
            "head": "def456",
            "branch": "work/runtime-update",
            "remote_origin": "git@github.com:andy4917/reservation-system.git",
            "status_count": 3,
            "git_dir_inside_repo": True,
        },
        "global_state": {
            "active_workspace_roots": [r"\\wsl$\Distro\repo\reservation-system"],
            "saved_workspace_roots": [
                r"\\wsl$\Distro\repo\reservation-system",
                r"X:\workspace\mirrors\reservation-system",
            ],
            "open_target_per_path": {
                "/workspace/mirrors/reservation-system": "explorer",
            },
            "thread_hint_counts": {
                "/workspace/mirrors/reservation-system": 154,
            },
        },
    }

    verdict = evaluate_alignment(report, config)

    assert verdict["ok"] is False
    assert "mirror_checkout_diverged" in verdict["failures"]
    assert "stale_saved_workspace_root" in verdict["warnings"]
    assert "stale_open_target_preference" in verdict["warnings"]


def test_repair_global_state_removes_stale_mirror_entries() -> None:
    config = build_test_config()
    state = {
        "active-workspace-roots": [r"\\wsl$\Distro\repo\reservation-system"],
        "electron-saved-workspace-roots": [
            r"\\wsl$\Distro\repo\reservation-system",
            r"\\wsl.localhost\Distro\repo\reservation-system",
            r"X:\workspace",
            r"X:\workspace\mirrors\reservation-system",
        ],
        "open-in-target-preferences": {
            "global": "explorer",
            "perPath": {
                "/workspace": "explorer",
                "/workspace/mirrors/reservation-system": "explorer",
            },
        },
        "thread-workspace-root-hints": {
            "old-thread": "/workspace/mirrors/reservation-system",
            "ops-thread": "/workspace",
        },
    }

    changed = repair_global_state(state, config)

    assert changed is True
    assert state["active-workspace-roots"] == [
        r"\\wsl$\Distro\repo\reservation-system"
    ]
    assert state["electron-saved-workspace-roots"] == [
        r"\\wsl$\Distro\repo\reservation-system",
        r"\\wsl.localhost\Distro\repo\reservation-system",
        r"X:\workspace",
    ]
    assert state["open-in-target-preferences"]["perPath"] == {
        "/workspace": "explorer"
    }
    assert state["thread-workspace-root-hints"] == {
        "ops-thread": "/workspace"
    }


def test_evaluate_alignment_allows_detached_mirror_as_warning_only() -> None:
    config = build_test_config()
    report = {
        "canonical_repo": {
            "exists": True,
            "head": "abc123",
            "branch": "work/runtime-update",
            "remote_origin": "git@github.com:andy4917/reservation-system.git",
            "status_count": 104,
            "git_dir_inside_repo": True,
        },
        "mirror_repo": {
            "exists": True,
            "head": "def456",
            "branch": "work/runtime-update",
            "remote_origin": "git@github.com:andy4917/reservation-system.git",
            "status_count": 3,
            "git_dir_inside_repo": True,
        },
        "global_state": {
            "active_workspace_roots": [r"\\wsl$\Distro\repo\reservation-system"],
            "saved_workspace_roots": [r"\\wsl$\Distro\repo\reservation-system"],
            "open_target_per_path": {},
            "thread_hint_counts": {},
        },
    }

    verdict = evaluate_alignment(report, config)

    assert verdict["ok"] is True
    assert verdict["failures"] == []
    assert "detached_stale_mirror_checkout_present" in verdict["warnings"]


def test_archive_mirror_checkout_moves_directory_once() -> None:
    with tempfile.TemporaryDirectory() as tmpdir:
        workspace_root = Path(tmpdir)
        mirror_dir = workspace_root / "reservation-system"
        mirror_dir.mkdir()
        (mirror_dir / ".git").mkdir()
        (mirror_dir / "README.md").write_text("stale checkout\n", encoding="utf-8")

        archived_path = archive_mirror_checkout(mirror_dir)

        assert archived_path is not None
        assert mirror_dir.exists() is False
        assert archived_path.exists() is True
        assert archived_path.name.startswith("reservation-system.stale-")


def main() -> None:
    test_evaluate_alignment_flags_divergent_standalone_mirror()
    test_repair_global_state_removes_stale_mirror_entries()
    test_evaluate_alignment_allows_detached_mirror_as_warning_only()
    test_archive_mirror_checkout_moves_directory_once()
    print("regression_workspace_alignment_py: OK")


if __name__ == "__main__":
    main()
