# Codex Workspace Alignment

## Canonical Paths

- Actual editing, tests, and Git work must run from `/home/dev/repos/reservation-system`.
- Codex Desktop should resolve this repo through the WSL workspace roots `\\wsl$\\Ubuntu-22.04\\home\\dev\\repos\\reservation-system` or `\\wsl.localhost\\Ubuntu-22.04\\home\\dev\\repos\\reservation-system`.

## Do Not Use

- `/mnt/c/Users/anise/workspaces/reservation-system` is the former detached mirror checkout and is not the source-of-truth repo.

## Current Verified State

- `python3 scripts/workspace_alignment/repair.py` removed stale Codex global-state references to the detached mirror path.
- `python3 scripts/workspace_alignment/check.py` now returns `verdict.ok: true` with no warnings.
- The mirror path currently does not exist on disk.

## Verification

Run:

```bash
python3 scripts/workspace_alignment/check.py
```

Expected result:

- `verdict.ok` is `true`.
- `warnings` is an empty list.

## Repair

Run:

```bash
python3 scripts/workspace_alignment/repair.py
```

What it does:

- removes stale saved workspace roots from `/mnt/c/Users/anise/.codex/.codex-global-state.json`
- removes stale open-target path preferences
- removes stale thread workspace hints that still point to the detached Windows mirror checkout
- preserves only canonical active roots that already exist; it does not fabricate a live active binding
- attempts to archive the detached Windows checkout by renaming it to `reservation-system.stale-<timestamp>`

## Known Lock Condition

- If `archive_error` reports `Permission denied`, a live Codex Desktop process still has the stale checkout open.
- In that case, close the Codex Desktop windows that still reference the stale checkout and rerun `python3 scripts/workspace_alignment/repair.py`.
- If `canonical_active_root_missing` appears after repair, reopen or rebind the repo in Codex Desktop so `active_workspace_roots` includes the canonical WSL path.
