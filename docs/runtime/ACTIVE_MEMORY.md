# Active Memory

- updated_at: 2026-03-25T23:04:22+09:00
- branch: `codex/reference-ledger-shell`
- commit: `f29ebdd`
- worktree: dirty

## Verified Facts
- Stage 1 minimal live-read baseline and Stage 2 mapping core baseline remain the current product floor.
- committed `app_v2` history already contains readonly live sheet bridge, ops preview, readonly management workflow, and engine status wording cleanup.
- current dirty worktree extends that baseline with provider session ingest, Wings reservation runtime, source fixture export, runtime safety snapshots, packaging scripts/docs/icons, and room-alias/hygiene guard fixes.
- fresh verification now includes `runtime_verify` JSON fallback recovery, ordered live bundle execution, and sheets_api 메시지 정합화가 반영된 결과입니다.
- pass: `app:check`, `app:build:main`, `regression_app_v2_live_bundle_contract`, `regression_app_v2_management_engine_contract`, `regression_app_v2_runtime_probe_contract`, `regression_app_v2_runtime_verify`, `regression_app_v2_runtime_safety_behavior`, `regression_app_v2_live_runtime_contract`, `regression_app_v2_runtime_safety_contract`, `regression_app_v2_runtime_readiness_contract`, `regression_app_v2_source_reservation_runtime`, `regression_app_v2_provider_storage_snapshot`, `regression_sheets_api_fetch_grid_range_py`, `regression_ops_workflow_py`, `regression_pms_reconcile_py`, `regression_app_v2_management_bridge_py`.
- `scripts/app_v2_runtime_verify.mjs`는 빌드/프로브 실패 시 `--json` 모드에서 구조화된 실패 payload을 반환하도록 보강되었습니다.
- `app_v2/main/liveReadRuntime.ts`는 PMS→OTA→Sheet 순차 실행으로 정렬되어 live bundle synthetic fallback 경로가 제거되었습니다.
- `app_v2/main/runtimeExclusive.ts`를 추가해 provider/Wings live runtime을 공용 배타 실행기로 직렬화했습니다.
- `app_v2/main/runtimeProbeProcess.ts`도 순차 실행으로 정리되어 probe 경로에서 같은 전역 런타임 충돌을 재도입하지 않습니다.
- `app_v2/main/reservationActionRunner.ts`는 운영 런타임에서 env fixture fallback 없이 live PMS source export만 사용합니다.
- `src/io/sheets_api.py`의 깨진 한글 예외 메시지를 정상 문구로 정리했습니다.

## Current Constraint
- 제품 경계는 read-only입니다.
- 실제 `read-live`는 provider/browser/sheet/Wings 운영 세션 없이는 증명되지 않습니다.
- portable/Windows packaging은 계약 검증만 끝났고 실제 산출물 build는 아직입니다.
- 로컬 워크스페이스 생성물은 현재 `dist-app/`만 유지하고, `build/`, `dist/`, `output/`, `output_review/`, `debug/`, `logs/`는 정리한 상태입니다.

## Active Risks
- dirty worktree 확장을 shipped/released로 표현하면 안 됩니다.
- 테스트 통과를 운영 세션 성공으로 해석하면 안 됩니다.
- archived stage notes는 이력일 뿐이며, 재진입 판단은 현재 `docs/runtime/*`와 `git status` 기준으로 다시 해야 합니다.
- `global-agent/node_modules/semver` 파손은 해소됐고, `npm install --ignore-scripts`와 일반 `npm install`이 다시 정상 완료됩니다.

## Resume Point
- 재시작 시 [HANDOFF.md](HANDOFF.md)부터 읽고, 이어서 [TASK_STATE.md](TASK_STATE.md)를 확인합니다.
- 코드 재진입은 `app_v2/main/providerDataRuntime.ts`, `app_v2/main/wingsReservationRuntime.ts`, `app_v2/main/reservationActionRunner.ts`, `app_v2/main/runtimeSafety.ts` 순서가 좋습니다.
