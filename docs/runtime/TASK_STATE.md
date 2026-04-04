# TASK STATE

- updated_at: 2026-04-04T11:07:18+09:00
- status: verified
- goal: Keep the local runtime handoff set aligned to the actual repository state and Codex workspace root used for implementation.
- current_milestone: Stage 1/2 read-only product path remains complete, `SEOLLEUNG` is promoted into the active branch contract, and Electron main now owns PMS/OTA/Station session-auth read attempts for active branches.
- next_step: when a live operator session is available, rerun the live-read runtime verify path against the new in-app proof surface to move beyond `offline-preview`.

## Completed
- Stage 1 minimal live-read path remains implemented as the main-owned read-only bundle.
- App branch contract now includes `COEX`, `GANGNAM`, `SEOLLEUNG`, and `SAMSUNG`, with `SAMSUNG` exposed as an inactive/preopen branch.
- Electron main `liveReadActions` now runs session-auth fetch attempts for `wings-pms`, `naver-partner`, and `admin-station` instead of placeholder-only PMS/OTA responses.
- Renderer now exposes `실조회 준비 상태` cards from runtime readiness plus actual read evidence for Sheets, Wings PMS, Naver OTA, and Station OTA.
- Stage 2 truth-aligned mapping core remains implemented with exact room/reservation auto binding, soft-triage retention, and precision metrics.
- Operator export, search, handoff, and UI shell surfaces remain wired to the current product path.
- Added the workspace-alignment check/repair path for this repo:
  - `scripts/lib/workspace_alignment.py`
  - `scripts/workspace_alignment/check.py`
  - `scripts/workspace_alignment/repair.py`
  - `tests/regression_workspace_alignment_py.py`
  - `docs/runtime/WORKSPACE_ALIGNMENT.md`
- Ran `python3 scripts/workspace_alignment/repair.py` and removed stale Codex global-state references to `/mnt/c/Users/anise/workspaces/reservation-system`.
- Revalidated workspace alignment with `verdict.ok: true` and no warnings after the active Codex workspace root was rebound to the canonical WSL path.
- Confirmed the local repository facts for the current resume point:
  - branch `work/runtime-update`
  - commit `8d345e1`
  - no non-doc drift before this runtime doc refresh
  - local checkout `/home/dev/repos/reservation-system`

## Current Findings
- `/home/dev/repos/reservation-system` is the only source-of-truth checkout for editing, tests, and Git operations.
- The former Windows mirror checkout path `/mnt/c/Users/anise/workspaces/reservation-system` is no longer referenced by active Codex global-state entries.
- The active Codex workspace root is currently rebound to the canonical WSL path for this repo.
- The runtime handoff docs that previously pointed at the old 2026-03-18 snapshot were stale relative to current HEAD and have now been refreshed.
- Product status is still read-only by contract; no write/apply path was added.
- Live-read auth/session proof is now visible in the default app shell instead of being implicit in main-only state.
- Truth mapping now retains `SEOLLEUNG` and `SAMSUNG` regardless of runtime gate, while the app shell only opens active read/action flows for `COEX`, `GANGNAM`, and `SEOLLEUNG`.

## Risks
- `read-live` is still unproven in this machine state until the live external environment is available again.
- `SEOLLEUNG` Wings PMS identifiers are now pinned from verified HAR evidence, but Naver/Station identifiers are still session-derived.
