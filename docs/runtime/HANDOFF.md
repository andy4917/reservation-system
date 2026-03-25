# Handoff

- updated_at: 2026-03-25T23:04:22+09:00
- branch: `codex/reference-ledger-shell`
- commit: `f29ebdd`
- status: active handoff snapshot

## Executive Summary
- 제품 기준선은 여전히 Stage 1 `live read 최소 경로` + Stage 2 `truth-aligned mapping core` 완료 상태입니다.
- 현재 dirty worktree의 중심 과제는 `app_v2`를 실제 운영 세션을 읽을 수 있는 read-only shell로 확장하는 것입니다.
- backend 정리 반영에서 `live bundle synthetic row fallback 제거`, `live bundle` 순차 실행(PMS→OTA→Sheet), `runtime_verify` JSON 복구, `sheets_api` 에러 메시지 정정이 완료되어 문서에 반영했습니다.
- 다만 실제 운영 환경 `read-live` 성립과 Windows 산출물 생성까지는 아직 확인하지 못했습니다.

## Confirmed Done
- committed baseline에는 readonly live sheet bridge, ops preview, readonly reservation workflow, engine status 정리가 포함되어 있습니다.
- `app_v2/main/providerDataRuntime.ts`는 Naver/Station 브라우저 쿠키와 storage snapshot을 읽어 provider row fetch에 넘기는 런타임 경로를 추가했습니다.
- `app_v2/main/wingsReservationRuntime.ts`는 HAR/env 설정과 브라우저 기반 auth bundle을 합쳐 Wings PMS reservation fetch를 구성하는 경로를 추가했습니다.
- `app_v2/main/sourceReservationRuntime.ts`와 `app_v2/main/runtimeSafety.ts`는 PMS reservation rows를 source fixture로 내보내고, source bundle 부재 시 `pending-source`/runtime error snapshot을 명시적으로 남기도록 정리했습니다.
- `package.json`, build scripts, icon assets, runtime docs는 portable/Windows packaging 경로와 packaged runtime asset lookup을 반영하도록 확장되었습니다.
- JS/Python/extension alias 경로와 hygiene allowlist 회귀 검증이 현재 dirty 상태 기준으로 맞춰져 있습니다.
- `app_v2/main/liveReadRuntime.ts`는 `runPmsRead -> runOtaRead -> runSheetRead` 순으로 번들을 순차 실행해 live bundle의 synthetic/fallback 병합을 제거했습니다.
- `app_v2/main/runtimeExclusive.ts`를 추가해 provider/Wings live runtime이 같은 글로벌 fetch/module 상태를 공유하지 않도록 공용 배타 실행기로 직렬화했습니다.
- `app_v2/main/runtimeProbeProcess.ts`는 `bundle/pms/ota/sheet/action` probe를 순차 실행으로 고정해 probe 경로에서 전역 런타임 충돌이 다시 생기지 않도록 맞췄습니다.
- `app_v2/main/reservationActionRunner.ts`는 운영 런타임에서 `APP_V2_SOURCE_FIXTURE_JSON` / `APP_V2_FIXTURE_MODE` env fallback을 더 이상 쓰지 않고, live PMS source export만 관리 경로 입력으로 사용합니다.
- `scripts/app_v2_runtime_verify.mjs`는 빌드 실패/프로브 출력 누락 시에도 `--json` 모드에서 구조화된 실패 payload를 반환해 자동화 파이프라인 파싱을 복구했습니다.
- `src/io/sheets_api.py`는 Google API 상태 응답을 포함한 표준 오류 메시지로 정리되고, grid 누락 메시지도 운영 메시지로 정합이 맞춰졌습니다.

## In Progress
- `app_v2/main/liveReadActions.ts`와 `app_v2/main/reservationActionRunner.ts`는 새 provider/Wings runtime을 실제 live read 및 management flow와 연결하는 전환 구간입니다.
- `app_v2/main/providerWorkspaceManager.ts`와 `app_v2/main/window.ts`는 provider workspace/session capture를 runtime consumer 쪽에 맞추는 정리 작업이 진행 중입니다.
- release note 문서 `[APP_V2_PORTABLE_RELEASE.md](APP_V2_PORTABLE_RELEASE.md)`와 `[APP_V2_WINDOWS_INSTALLER.md](APP_V2_WINDOWS_INSTALLER.md)`는 존재하지만, 실제 산출물 생성 결과로 닫힌 상태는 아닙니다.
- `src/reconcile/sheet_reconcile.py`, `src/scan/sheet_scan.py`, `src/report/reservationVerification.js`, `extension/src/shared/syncPolicy.js` 변경은 room alias 정합을 맞춘 상태이나, 운영 smoke까지 끝난 것은 아닙니다.

## What Is True Now
- 제품 경계는 계속 read-only입니다.
- 브랜치는 `origin/codex/reference-ledger-shell` 대비 `ahead 3`이고 worktree는 dirty입니다.
- 문서와 테스트는 현재 dirty 상태를 설명할 뿐, 이 상태가 릴리스 기준선이라는 뜻은 아닙니다.
- 실제 `read-live`는 provider/browser/sheet/Wings 환경이 모두 준비되어야 하며, 현재 통과한 회귀 테스트는 계약 검증이지 운영 증명은 아닙니다.
- 로컬 생성물 디렉터리는 `dist-app/`만 유지하고 `build/`, `dist/`, `output/`, `output_review/`, `debug/`, `logs/`는 정리한 상태입니다.

## Where To Look First
- 총 상태: [TASK_STATE.md](TASK_STATE.md)
- 빠른 재진입 메모: [ACTIVE_MEMORY.md](ACTIVE_MEMORY.md)
- 운영/로드맵 기준선: [APP_IMPLEMENTATION_ROADMAP.md](../architecture/APP_IMPLEMENTATION_ROADMAP.md)
- portable note: [APP_V2_PORTABLE_RELEASE.md](APP_V2_PORTABLE_RELEASE.md)
- Windows packaging note: [APP_V2_WINDOWS_INSTALLER.md](APP_V2_WINDOWS_INSTALLER.md)

## Code Surfaces To Resume
- live read entry: `app_v2/main/liveReadActions.ts`
- provider session/runtime: `app_v2/main/providerDataRuntime.ts`
- Wings runtime: `app_v2/main/wingsReservationRuntime.ts`
- management/runtime safety: `app_v2/main/reservationActionRunner.ts`, `app_v2/main/sourceReservationRuntime.ts`, `app_v2/main/runtimeSafety.ts`
- alias/policy alignment: `src/reconcile/sheet_reconcile.py`, `src/scan/sheet_scan.py`, `src/report/reservationVerification.js`, `extension/src/shared/syncPolicy.js`

## Fresh Verification
- `git status --short --branch`
- `git status --short --branch` → PASS
- `node tests/regression_app_v2_runtime_verify.mjs` → PASS
- `node tests/regression_app_v2_live_bundle_contract.mjs` → PASS
- `node tests/regression_app_v2_management_engine_contract.mjs` → PASS
- `node tests/regression_app_v2_live_runtime_contract.mjs` → PASS
- `node tests/regression_app_v2_runtime_safety_contract.mjs` → PASS
- `node tests/regression_app_v2_runtime_safety_behavior.mjs` → PASS
- `python3 tests/regression_app_v2_management_bridge_py.py` → PASS
- `python3 tests/regression_sheets_api_fetch_grid_range_py.py` → PASS
- `python3 tests/regression_ops_workflow_py.py` → PASS
- `python3 tests/regression_pms_reconcile_py.py` → PASS
- `npm run app:check` → PASS
- `npm run app:build:main` → PASS
- `node tests/regression_app_v2_runtime_readiness_contract.mjs` → PASS
- `node tests/regression_app_v2_source_reservation_runtime.mjs` → PASS
- `node tests/regression_app_v2_provider_storage_snapshot.mjs` → PASS

## Remaining Work
1. 실운영 provider/browser/sheet/Wings 세션으로 `app_v2` live read smoke를 수행해 `offline-preview`에서 `read-live`로 넘어가는지 확인해야 합니다.
2. `compare`/`reconcile`/`apply` 흐름에서 source fixture export와 `pending-source` 상태가 실제 UI/ops flow와 맞는지 운영 세션으로 검증해야 합니다.
3. Windows 대상 환경에서 `npm run app:dist:portable` 및 `npm run app:dist:win`을 실행해 실제 산출물 경로와 문서를 일치시켜야 합니다.
4. dirty legacy-adjacent 변경(`sync/report/scan/extension`)을 scope freeze 후 커밋 경계로 분리할지, `app_v2` 중심 diff에 흡수할지 결정해야 합니다.

## Handoff Rule
- 다음 작업자는 현재 상태를 release 완료로 취급하지 말고, dirty worktree 기반 handoff로 취급해야 합니다.
- 재시작 시 문서보다 먼저 `git status --short --branch`와 위 검증 명령을 다시 확인해 local drift를 배제해야 합니다.
