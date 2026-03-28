# Codex Workspace Alignment

## Canonical paths

- Actual editing, tests, and Git work must run from `/home/dev/repos/reservation-system`.
- Codex Desktop should resolve this repo through the WSL workspace roots `\\wsl$\\Ubuntu-22.04\\home\\dev\\repos\\reservation-system` or `\\wsl.localhost\\Ubuntu-22.04\\home\\dev\\repos\\reservation-system`.

## Do not use

- `/mnt/c/Users/anise/workspaces/reservation-system` is a detached stale checkout. It is not the source-of-truth repo and can drift from the Linux checkout.

## Verification

Run:

```bash
python3 scripts/workspace_alignment/check.py
```

Expected result:

- `verdict.ok` should be `true`.
- `detached_stale_mirror_checkout_present` is hygiene debt only. It means the stale Windows checkout still exists on disk but is no longer referenced by active Codex state.

## Repair

Run:

```bash
python3 scripts/workspace_alignment/repair.py
```

What it does:

- removes stale saved workspace roots from `/mnt/c/Users/anise/.codex/.codex-global-state.json`
- removes stale open-target path preferences
- removes stale thread workspace hints that still point to the detached Windows checkout
- attempts to archive the detached Windows checkout by renaming it to `reservation-system.stale-<timestamp>`

## Known lock condition

- If `archive_error` reports `Permission denied`, a live Codex Desktop process still has the stale checkout open.
- In that case, close the Codex Desktop windows that still reference the stale checkout and rerun `python3 scripts/workspace_alignment/repair.py`.
