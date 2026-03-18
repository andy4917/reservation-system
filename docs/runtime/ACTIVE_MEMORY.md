# Active Memory

- updated_at: 2026-03-18T22:50:13+09:00
- branch: `codex/reference-ledger-shell`
- commit: `fd37173`

## Verified Facts
- Stage 1 minimal live-read contract is implemented and verified at the code-path level.
- Stage 2 mapping core v1 is implemented with exact room/reservation auto binding and precision metrics.
- Operator export, search, handoff, and UI shell are aligned to the current product path.
- The repo worktree was clean before this documentation refresh started.

## Current Constraint
- The product is read-only.
- The environment is not currently capable of proving `read-live`.
- `offline-preview` is the correct classification for this machine right now.

## Active Risks
- Do not describe fixture or contract completeness as operational live success.
- Do not reintroduce hardcoded operational values to bypass live environment gaps.
- Keep old stage design memos archived, not active, to avoid doc drift.

## Resume Point
- If work resumes, start from [HANDOFF.md](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/docs/runtime/HANDOFF.md) and [STAGE_V1_CHECKLIST.md](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/docs/runtime/STAGE_V1_CHECKLIST.md).
