# Handoff

- updated_at: 2026-03-29T16:02:35+09:00
- branch: `work/runtime-update`
- commit: `8d345e1`
- status: verified handoff snapshot

## What Is Done
- Stage 1 minimal live-read path remains implemented as the main-owned bundle.
- Stage 2 mapping core v1 remains implemented with truth signals, exact alias/identity auto binding, soft-triage retention, and precision metrics.
- Workspace alignment cleanup is implemented and verified so Codex points at the Linux checkout instead of the detached Windows mirror path.
- Runtime docs have been refreshed to the current local HEAD state.

## What Is True Now
- The product is still read-only by contract.
- The canonical editing/test/Git root is `/home/dev/repos/reservation-system`.
- `python3 scripts/workspace_alignment/check.py` currently returns `ok: true` with no warnings.
- `git status --short --branch` shows `work/runtime-update` ahead of `origin/work/runtime-update` by 1 commit; after this refresh, the runtime doc set itself is the only local modification.
- Live operator proof is still pending; `read-live` cannot be claimed from the current local environment alone.

## Where To Look First
- runtime status: [PLAN.md](/home/dev/repos/reservation-system/docs/runtime/PLAN.md)
- task snapshot: [TASK_STATE.md](/home/dev/repos/reservation-system/docs/runtime/TASK_STATE.md)
- active memory: [ACTIVE_MEMORY.md](/home/dev/repos/reservation-system/docs/runtime/ACTIVE_MEMORY.md)
- workspace root rules: [WORKSPACE_ALIGNMENT.md](/home/dev/repos/reservation-system/docs/runtime/WORKSPACE_ALIGNMENT.md)
- stage checklist: [STAGE_V1_CHECKLIST.md](/home/dev/repos/reservation-system/docs/runtime/STAGE_V1_CHECKLIST.md)

## Code Surfaces
- workspace alignment logic: [workspace_alignment.py](/home/dev/repos/reservation-system/scripts/lib/workspace_alignment.py)
- workspace alignment check: [check.py](/home/dev/repos/reservation-system/scripts/workspace_alignment/check.py)
- workspace alignment repair: [repair.py](/home/dev/repos/reservation-system/scripts/workspace_alignment/repair.py)
- workspace alignment regression: [regression_workspace_alignment_py.py](/home/dev/repos/reservation-system/tests/regression_workspace_alignment_py.py)
- app runtime contract anchor: [app-v2-contracts.ts](/home/dev/repos/reservation-system/src/desktop/app-v2-contracts.ts)

## Verification Used
- `python3 scripts/workspace_alignment/repair.py`
- `python3 scripts/workspace_alignment/check.py`
- `python3 tests/regression_workspace_alignment_py.py`
- `git status --short --branch`

## Remaining Risks
- Real `read-live` success is still blocked on the external sheet/provider/wings environment.
- This handoff proves local repo state and Codex workspace alignment, not live operational success.

## Next Recommended Action
1. Restore a live environment and rerun the runtime verification path for live read.
