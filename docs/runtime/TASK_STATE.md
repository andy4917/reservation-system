# TASK STATE

- updated_at: 2026-03-25T23:04:22+09:00
- status: active
- goal: Stage 1/2 완료 기준선 위에서 `app_v2` read-only 운영 셸의 live source/runtime safety/packaging 확장 상태를 최신 검증 기준으로 재정리하고 핸드오프 가능한 상태로 고정
- current_milestone: committed `app_v2` readonly bridge/ops baseline 위에 provider session ingest, Wings source runtime, source fixture export, runtime safety, packaging 정합을 얹는 전환 구간
- next_step: 실제 운영 세션 smoke와 Windows 산출물 build로 contract-verified 상태를 운영 검증으로 승격

## Completed
- Stage 1 `Live Read 최소 경로`와 Stage 2 `Truth-Aligned Mapping Core` 기준선은 유지됩니다.
- committed baseline `7cf7249`, `9b032d8`, `f29ebdd`까지의 `app_v2` readonly live bridge, ops preview, management workflow, engine status wording 정리가 유지됩니다.
- dirty worktree 기준으로 provider/browser session material ingest, Wings reservation runtime, source reservation fixture export, runtime safety snapshot, packaging scripts/docs/icons 확장분이 존재합니다.
- backend 정리 기준 반영 완료
  - `app_v2/main/liveReadRuntime.ts`: live bundle synthetic row fallback 제거 및 PMS → OTA → Sheet 순차 실행 고정.
  - `app_v2/main/runtimeExclusive.ts`: provider/Wings live runtime이 같은 글로벌 fetch/module 상태를 공유하지 않도록 공용 배타 실행기로 직렬화.
  - `app_v2/main/runtimeProbeProcess.ts`: runtime probe도 bundle/pms/ota/sheet/action을 순차 실행하도록 정리.
  - `app_v2/main/reservationActionRunner.ts`: 운영 경로에서 `APP_V2_SOURCE_FIXTURE_JSON` / `APP_V2_FIXTURE_MODE` env fallback 제거, live PMS source export만 사용.
  - `scripts/app_v2_runtime_verify.mjs`: `--json`에서 빌드 실패/프로브 누락 시 구조화된 실패 payload을 반환하도록 복구.
  - `src/io/sheets_api.py`: API 상태 기반 메시지 정규화 및 `fetch_grid` 누락 메시지 정합화.
- 최신 검증에서 다음 명령이 통과했습니다.
  - `node tests/regression_app_v2_live_runtime_contract.mjs`
  - `node tests/regression_app_v2_live_bundle_contract.mjs`
  - `node tests/regression_app_v2_management_engine_contract.mjs`
  - `node tests/regression_app_v2_runtime_verify.mjs`
  - `node tests/regression_app_v2_runtime_safety_contract.mjs`
  - `node tests/regression_app_v2_runtime_safety_behavior.mjs`
  - `node tests/regression_app_v2_runtime_probe_contract.mjs`
  - `node tests/regression_app_v2_runtime_readiness_contract.mjs`
  - `node tests/regression_app_v2_source_reservation_runtime.mjs`
  - `node tests/regression_app_v2_provider_storage_snapshot.mjs`
  - `node tests/regression_app_v2_management_bridge_py.py`
  - `python3 tests/regression_sheets_api_fetch_grid_range_py.py`
  - `python3 tests/regression_ops_workflow_py.py`
  - `python3 tests/regression_pms_reconcile_py.py`
  - `npm run app:check`
  - `npm run app:build:main`

## Current Findings
- 현재 브랜치는 `codex/reference-ledger-shell`이며 `origin/codex/reference-ledger-shell` 대비 `ahead 3`입니다.
- worktree는 dirty 상태이고 `app_v2/main/*`, `package.json`, `scripts/*`, `docs/runtime/*`, `extension/*`, `src/reconcile|report|scan/*`, icon assets가 함께 움직이고 있습니다.
- `app_v2`는 이제 provider browser에서 쿠키/localStorage/sessionStorage를 읽어 live provider rows와 Wings PMS reservation fetch에 넘길 수 있는 구조를 가집니다.
- provider/Wings live runtime은 공용 직렬화 경로로 묶여 bundle/read probe에서 전역 `fetch` 충돌 가능성을 줄였습니다.
- management flow는 PMS reservation rows를 source fixture로 저장할 수 있고, source bundle이 없으면 `pending-source` snapshot으로 명시적으로 멈추게 설계되어 있습니다.
- fixture mode, HAR/env fallback, DOM/provider fallback은 아직 일부 런타임에 남아 있어 운영 주경로를 완전히 fail-closed 했다고 보기는 어렵습니다.
- portable/Windows packaging 경로와 packaged runtime asset lookup은 계약 테스트로 검증됐지만, 실제 배포 산출물 생성까지 이번 세션에서 실행한 것은 아닙니다.
- COEX room alias와 hygiene absolute path allowlist는 현재 dirty 코드 기준으로 JS/Python/extension 경로가 맞춰져 있습니다.
- 로컬 워크스페이스 생성물은 현재 `dist-app/`만 유지하고, `build/`, `dist/`, `output/`, `output_review/`, `debug/`, `logs/`는 정리했습니다.

## Remaining Work
- 운영 세션에서 `app_v2` live read가 실제로 성공하는지 확인
- `compare`/`reconcile`/`apply` UI 흐름에서 source fixture와 runtime safety fallback이 실제 사용자 흐름과 맞는지 확인
- Windows 환경에서 portable/installer 산출물 실제 생성 및 문서 경로 재확인
- dirty worktree 변경을 커밋 경계별로 정리하고 release 서사와 문서를 최종 동기화

## Risks
- dirty worktree의 설명과 release 가능 상태를 혼동하면 안 됩니다.
- contract/build/regression 통과만으로 운영 환경 `read-live` 성공을 주장할 수 없습니다.
- Windows packaging은 실제 타깃 환경 빌드 전까지는 문서/계약 수준 보장에 머뭅니다.
- alias/policy 정합은 회귀 테스트로는 닫혔지만, 실제 데이터셋과 운영 smoke까지는 남아 있습니다.
- `npm install --ignore-scripts`와 일반 `npm install`이 다시 정상 완료됩니다. `global-agent/node_modules/semver` 파손은 해소됐고, 현재 node_modules는 재설치 가능한 상태로 복구됐습니다.
