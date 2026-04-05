# Active Memory

- updated_at: 2026-03-29T16:02:35+09:00
- branch: `work/runtime-update`
- commit: `8d345e1`

## Verified Facts
- The authoritative local checkout is `/home/dev/repos/reservation-system`.
- Stage 1 minimal live-read and Stage 2 truth-aligned mapping core remain the current product baseline.
- The latest completed work in this checkout is workspace-alignment hygiene, not a new product-path feature increment.
- `python3 scripts/workspace_alignment/check.py` now returns `ok: true` with no warnings.
- The current local diff includes runtime doc refresh plus app_v2 contamination cleanup.

## Current Constraint
- The product remains read-only.
- Current local evidence proves repository/workspace alignment only.
- Live environment availability is still required to prove `read-live`.

## Active Risks
- Do not describe local alignment success as live operational readiness.
- Do not reuse the detached Windows mirror checkout as an implementation root.

## Resume Point
- Start from [HANDOFF.md](/home/dev/repos/reservation-system/docs/runtime/HANDOFF.md) and [WORKSPACE_ALIGNMENT.md](/home/dev/repos/reservation-system/docs/runtime/WORKSPACE_ALIGNMENT.md).
