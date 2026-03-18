# PLAN

- updated_at: 2026-03-18T22:34:21+09:00
- goal: Stage 1 `Live Read 최소 경로`와 Stage 2 `Truth-Aligned Mapping Core` completion을 위해 실제 시트/PMS 기반 alias/identity auto binding과 precision/soft-triage surface를 제품 경로에 닫습니다.

## Steps
1. 완료: 상위 루트 `AGENTS.md`, `memory-bootstrap`, runtime 문서를 다시 읽고 continuation 작업으로 재부트스트랩했습니다.
2. 완료: `desktop:fetch-live-read-bundle`, `liveReadRuntime`, `uiStore`를 기준으로 shared run contract와 main-owned branch/date scope를 구현 상태 기준으로 재검토했습니다.
3. 완료: `truthCatalogRuntime`를 truth loader 단일 원본으로 확장하고, `mappingTruthRuntime`의 중복 로딩/캐시를 제거했습니다.
4. 완료: `bindingArtifacts`의 section hardcode 필터를 제거하고 metrics/truth signal 보존 경로를 유지하도록 갱신했습니다.
5. 완료: `reservationAudit`, `ipc`, `liveReadRuntime`, `uiStore`에서 branch scope 및 live availability 판정을 보수적으로 조정했습니다.
6. 완료: `operatingProgress`, runtime 추적 문서, 회귀 테스트 기대값을 최신 구현 기준으로 갱신했습니다.
7. 완료: `mappingAutoBindingRuntime`를 추가해 시트 `readHints/reservationBlocks`와 PMS reservation rows를 기준으로 room alias / reservation identity auto binding slice를 main artifact 경로에 연결했습니다.
8. 완료: `operatorExportRuntime`에 `exactAutoBindingCount`, `softTriageCount`, `precisionScore`, `precisionGate`를 manifest/metrics/copy text/csv/preview/operator loop까지 노출했습니다.
9. 완료: `searchRuntime`에 section 단위 `binding-summary` 문서를 추가하고, unresolved binding 검색 문서에 confidence/domain/severity/rule/evidence signal을 포함시켰습니다.
10. 완료: `RightPanel`, `SettingsSurface`에 exact auto binding, soft triage, precision gate/score를 최소 UI 변경으로 노출했습니다.
11. 완료: `binding_artifacts`, `mapping_auto_binding_runtime`, `operator_export_runtime`, `search_runtime`, `ui_store_live_wings_flow`, `live_read_verify`까지 completion 검증 경로를 재실행했습니다.

## Verification Gate
- 제품 코드 변경이 있으므로 변경 경로와 직접 연결된 guard만 통과 기준으로 사용합니다.
- 확인한 guard:
  - `npm run app:check`
  - `npm run app:build:main`
  - `node tests/regression_app_binding_artifacts.mjs`
  - `node tests/regression_app_mapping_auto_binding_runtime.mjs`
  - `node tests/regression_app_operator_export_runtime.mjs`
  - `node tests/regression_app_search_runtime.mjs`
  - `node --experimental-vm-modules tests/regression_app_ui_store_live_wings_flow.mjs`
  - `node scripts/live_read_verify.mjs --json`
- `live_read_verify` 결과는 현재 환경 기준 `sheet-unconfigured / provider unavailable / wings unavailable`로 read-only `offline-preview`를 명시했습니다.

## Out Of Scope
- write-mode 운영 자동화
- 실제 운영 세션 복구 없이 `offline-preview`를 `read-live`로 바꾸는 환경 작업
- broad UI rewrite
