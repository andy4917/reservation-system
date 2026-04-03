# Stage / V1 Checklist

- updated_at: 2026-03-31T22:30:00+09:00
- branch: `work/runtime-update`
- commit: `9c4d61a`
- scope: active branch runtime expansion (`COEX`/`GANGNAM`/`SEOLLEUNG`), Samsung inactive gating, and Electron main session-auth live-read path closure for the local Codex checkout

## Current Status

### Stage 0. Baseline Alignment
- [x] Fix the implementation root to `/home/dev/repos/reservation-system`
- [x] Keep runtime tracking docs (`PLAN`, `TASK_STATE`, `HANDOFF`, `ACTIVE_MEMORY`) on the active local checkout
- [x] Remove stale Codex references to `/mnt/c/Users/anise/workspaces/reservation-system`

### Stage 1. Live Read Minimal Path
- [x] `LiveReadRunContext`와 main-owned bundle 경로 연결
- [x] sheet / provider / wings를 공통 coverage로 묶음
- [x] branch/date scope를 main 기준으로 정리
- [x] `SEOLLEUNG` 활성 / `SAMSUNG` inactive branch contract 반영
- [x] PMS / Naver OTA / Station session-auth read path를 Electron main에 연결
- [ ] 실제 운영 세션으로 `read-live` smoke 확인
메모: live environment proof is still pending.

### Stage 2. Truth-Aligned Mapping Core
- [x] truth loader 단일 원본화
- [x] mapping artifact metrics / truth signals 연결
- [x] room alias exact auto binding
- [x] reservation identity exact auto binding
- [x] soft match를 unresolved triage로 보존
- [x] precision score / precision gate 계산

### Stage 3. Search / Recommendation 실제화
- [x] unresolved / validation / evidence / trace 기반 bounded search
- [x] `binding-summary` 문서 추가
- [x] unresolved precision evidence 검색 가능화
- [~] recommendation 고도화는 후속 범위

### Stage 4. Evidence / Export / Operator Loop
- [x] operator export bundle 생성
- [x] copy text / JSON / CSV handoff
- [x] handoff history / follow-up queue
- [x] precision / soft-triage metric을 export와 UI에 노출

### Stage 5. Apply 판단
- [ ] write-mode 및 apply 경계 결정
- [ ] 감사/인증 포함 write 경로 설계

## Verification Snapshot
- [x] `python3 scripts/workspace_alignment/repair.py`
- [x] `python3 scripts/workspace_alignment/check.py`
- [x] `python3 tests/regression_workspace_alignment_py.py`
- [x] `git status --short --branch`
- [ ] live environment runtime verify

## Next Cut
1. Restore a live environment and rerun live-read verification.
2. Pin live branch identifiers for `SEOLLEUNG` in truth mapping once verified from runtime evidence.
3. Keep write/apply as a separate follow-on track unless the product contract changes.
