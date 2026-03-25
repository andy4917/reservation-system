# Stage / V1 Checklist

- updated_at: 2026-03-18T22:50:13+09:00
- branch: `codex/reference-ledger-shell`
- commit: `fd37173`
- scope: live-read mapping core, operator/search/handoff surface, reference shell UI

## Current Status

### Stage 0. 기준선 재정렬
- [x] 앱/확장/브리지/read-only 책임을 제품 문서로 고정
- [x] runtime 추적 문서(`PLAN`, `TASK_STATE`)를 작업 기준으로 유지

### Stage 1. Live Read 최소 경로
- [x] `LiveReadRunContext`와 main-owned bundle 경로 연결
- [x] sheet / provider / wings를 공통 coverage로 묶음
- [x] branch/date scope를 main 기준으로 정리
- [ ] 실제 운영 세션으로 `read-live` smoke 확인
메모: 현재 환경 검증값은 `offline-preview`입니다.

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

## V1 Definition

### V1 필수
- [x] 지점/기간/모드 선택
- [x] read-only inventory / reservation / sheet 상태 수집
- [x] canonical mapping 기반 mismatch / anomaly / unresolved 표시
- [x] search / export / operator handoff
- [x] 기본 운영 셸 UI 정리

### V1 미완
- [ ] 실제 운영 세션 기준 `read-live` 최종 확인
- [ ] write-mode/apply 범위 결정

## Verification Snapshot
- [x] `npm run app:check`
- [x] `npm run app:build:main`
- [x] `node tests/regression_app_binding_artifacts.mjs`
- [x] `node tests/regression_app_mapping_auto_binding_runtime.mjs`
- [x] `node tests/regression_app_operator_export_runtime.mjs`
- [x] `node tests/regression_app_search_runtime.mjs`
- [x] `node --experimental-vm-modules tests/regression_app_ui_store_live_wings_flow.mjs`
- [x] `node scripts/app_v2_runtime_verify.mjs --focus live-read`

## Next Cut
1. 운영 세션이 준비된 환경에서 `offline-preview -> read-live`를 실증합니다.
2. soft-match triage 보조를 recommendation 쪽에 제한적으로 연결합니다.
3. write-mode/apply를 v1.1 이후 범위로 분리할지 결정합니다.
