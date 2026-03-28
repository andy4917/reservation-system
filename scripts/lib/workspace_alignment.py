from __future__ import annotations

import json
import os
import subprocess
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class CommandResult:
    ok: bool
    stdout: str
    stderr: str
    returncode: int


@dataclass(frozen=True)
class AlignmentConfig:
    repo_root: Path
    mirror_repo: Path
    global_state_path: Path
    canonical_active_roots: tuple[str, ...]
    stale_saved_root: str
    stale_open_target_path: str


def to_windows_path(path: Path) -> str:
    parts = list(path.parts)
    if len(parts) >= 4 and parts[1] == "mnt" and len(parts[2]) == 1:
        drive = parts[2].upper()
        suffix = "\\".join(parts[3:])
        return f"{drive}:\\{suffix}"
    return str(path)


def to_wsl_workspace_root(repo_root: Path, host: str) -> str:
    return "\\\\" + host + "\\" + os.environ.get("WSL_DISTRO_NAME", "Ubuntu-22.04") + repo_root.as_posix().replace("/", "\\")


def build_config(
    repo_root: Path | None = None,
    codex_home: Path | None = None,
) -> AlignmentConfig:
    resolved_repo_root = (repo_root or Path(__file__).resolve().parents[2]).resolve()
    resolved_codex_home = Path(
        codex_home
        or os.environ.get("CODEX_HOME")
        or (Path.home() / ".codex")
    ).resolve()
    codex_owner_root = resolved_codex_home.parent
    mirror_repo = codex_owner_root / "workspaces" / resolved_repo_root.name
    return AlignmentConfig(
        repo_root=resolved_repo_root,
        mirror_repo=mirror_repo,
        global_state_path=resolved_codex_home / ".codex-global-state.json",
        canonical_active_roots=(
            to_wsl_workspace_root(resolved_repo_root, "wsl$"),
            to_wsl_workspace_root(resolved_repo_root, "wsl.localhost"),
        ),
        stale_saved_root=to_windows_path(mirror_repo),
        stale_open_target_path=mirror_repo.as_posix(),
    )


def run_git(path: Path, *args: str) -> CommandResult:
    try:
        completed = subprocess.run(
            ["git", "-C", str(path), *args],
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return CommandResult(False, "", "git executable not found", 127)
    return CommandResult(
        ok=completed.returncode == 0,
        stdout=completed.stdout.strip(),
        stderr=completed.stderr.strip(),
        returncode=completed.returncode,
    )


def git_summary(path: Path) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "path": str(path),
        "exists": path.exists(),
        "git_dir_inside_repo": False,
        "head": None,
        "branch": None,
        "remote_origin": None,
        "status_count": None,
        "top_level": None,
    }
    if not path.exists():
        return summary

    git_dir = run_git(path, "rev-parse", "--git-dir")
    if git_dir.ok:
        summary["git_dir_inside_repo"] = git_dir.stdout == ".git"

    top_level = run_git(path, "rev-parse", "--show-toplevel")
    if top_level.ok:
        summary["top_level"] = top_level.stdout

    head = run_git(path, "rev-parse", "HEAD")
    if head.ok:
        summary["head"] = head.stdout

    branch = run_git(path, "branch", "--show-current")
    if branch.ok:
        summary["branch"] = branch.stdout

    remote = run_git(path, "remote", "get-url", "origin")
    if remote.ok:
        summary["remote_origin"] = remote.stdout

    status = run_git(path, "status", "--short")
    if status.ok:
        lines = [line for line in status.stdout.splitlines() if line.strip()]
        summary["status_count"] = len(lines)

    return summary


def load_global_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def collect_global_state_summary(state: dict[str, Any]) -> dict[str, Any]:
    hints = state.get("thread-workspace-root-hints", {})
    hint_counts = Counter(str(value) for value in hints.values())
    open_target = state.get("open-in-target-preferences", {})
    return {
        "active_workspace_roots": list(state.get("active-workspace-roots", [])),
        "saved_workspace_roots": list(state.get("electron-saved-workspace-roots", [])),
        "open_target_per_path": dict(open_target.get("perPath", {})),
        "thread_hint_counts": dict(hint_counts),
    }


def build_alignment_report(
    config: AlignmentConfig,
) -> dict[str, Any]:
    state = load_global_state(config.global_state_path)
    return {
        "canonical_repo": git_summary(config.repo_root),
        "mirror_repo": git_summary(config.mirror_repo),
        "global_state": collect_global_state_summary(state),
    }


def evaluate_alignment(report: dict[str, Any], config: AlignmentConfig) -> dict[str, Any]:
    failures: list[str] = []
    warnings: list[str] = []

    canonical = report["canonical_repo"]
    mirror = report["mirror_repo"]
    global_state = report["global_state"]

    mirror_referenced = False
    saved_roots = set(global_state.get("saved_workspace_roots", []))
    open_targets = global_state.get("open_target_per_path", {})
    hint_count = global_state.get("thread_hint_counts", {}).get(config.stale_open_target_path, 0)

    if config.stale_saved_root in saved_roots:
        mirror_referenced = True
        warnings.append("stale_saved_workspace_root")

    if config.stale_open_target_path in open_targets:
        mirror_referenced = True
        warnings.append("stale_open_target_preference")

    if hint_count:
        mirror_referenced = True
        warnings.append("historical_thread_hints_still_point_to_stale_mirror")

    if mirror.get("exists") and mirror.get("git_dir_inside_repo"):
        if mirror.get("head") != canonical.get("head"):
            if mirror_referenced:
                failures.append("mirror_checkout_diverged")
            else:
                warnings.append("detached_stale_mirror_checkout_present")
        elif mirror.get("status_count") != canonical.get("status_count"):
            warnings.append("mirror_checkout_dirty_count_drift")

    active_roots = set(global_state.get("active_workspace_roots", []))
    if not active_roots.intersection(config.canonical_active_roots):
        failures.append("canonical_active_root_missing")

    return {
        "ok": not failures,
        "failures": failures,
        "warnings": warnings,
    }


def repair_global_state(state: dict[str, Any], config: AlignmentConfig) -> bool:
    changed = False

    active_roots = list(state.get("active-workspace-roots", []))
    normalized_active = [root for root in active_roots if root in config.canonical_active_roots]
    if normalized_active != active_roots:
        state["active-workspace-roots"] = normalized_active
        changed = True

    saved_roots = list(state.get("electron-saved-workspace-roots", []))
    normalized_saved = [root for root in saved_roots if root != config.stale_saved_root]
    if normalized_saved != saved_roots:
        state["electron-saved-workspace-roots"] = normalized_saved
        changed = True

    open_target = state.setdefault("open-in-target-preferences", {})
    per_path = dict(open_target.get("perPath", {}))
    if config.stale_open_target_path in per_path:
        per_path.pop(config.stale_open_target_path, None)
        open_target["perPath"] = per_path
        changed = True

    hints = dict(state.get("thread-workspace-root-hints", {}))
    filtered_hints = {
        thread_id: root
        for thread_id, root in hints.items()
        if root != config.stale_open_target_path
    }
    if filtered_hints != hints:
        state["thread-workspace-root-hints"] = filtered_hints
        changed = True

    return changed


def save_global_state(state: dict[str, Any], path: Path) -> None:
    serialized = json.dumps(state, ensure_ascii=False, indent=2)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(serialized + "\n", encoding="utf-8")
    tmp_path.replace(path)


def archive_mirror_checkout(mirror_repo: Path) -> Path | None:
    if not mirror_repo.exists():
        return None
    if not (mirror_repo / ".git").exists():
        return None
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")
    archived = mirror_repo.with_name(f"{mirror_repo.name}.stale-{timestamp}")
    mirror_repo.rename(archived)
    return archived
