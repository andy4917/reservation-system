# 시트 읽기 / Mapping / Search 실행 체크리스트

Last updated: 2026-03-14

기준 문서:

- [`SHEET_MAPPING_SEARCH_BASELINE.md`](SHEET_MAPPING_SEARCH_BASELINE.md)
- [`APP_PRODUCT_OPERATING_MODEL.md`](APP_PRODUCT_OPERATING_MODEL.md)

이 문서는 최신 Patch 1~7 결정을 실제 구현 순서와 검증 게이트로 고정하기 위한 실행 문서입니다.

## 1. 먼저 잠가야 하는 결정

후속 구현은 아래 결정을 기본값으로 고정합니다.

1. 1차 목표
- `실제 시트 read 안정화 + mapping unresolved 분리 + 점프 가능한 search`

2. read artifact 저장 원칙
- `renderer state보다 main-run artifact store 우선`

3. renderer 상태 원칙
- `summary + selectedRunId + visibleSlice 우선`
- 대형 rows를 renderer store에 상주시켜 두지 않음

4. canonical 기준
- `raw / canonical 동시 보존`
- 운영 판정은 canonical 기준

5. binding 저장 전략
- `로컬 저장 우선 + developer metadata 보조`

6. 계산 위치 원칙
- compare / audit / search는 renderer 직접 계산보다 `main -> worker/subprocess` 우선

7. embedding 도입 시점
- `Stage D 이후`

8. 브리지 전략
- `기존 loopback bridge 유지`

9. 재평가 조건
- Stage C 종료 후에도 RAM, 배포 복잡도, 운영자 체감이 기준 미달이면 좁은 Tauri 스파이크를 별도 브랜치에서만 검증

위 결정을 바꾸려면 기준 문서를 먼저 수정합니다.

## 2. 공통 작업 규칙

모든 후속 작업은 아래 순서를 따릅니다.

1. 이번 변경이 Patch 1/2/3/4/5/6/7 중 어디에 속하는지 먼저 적습니다.
2. 새 타입이나 계약이 생기면 타입 추가보다 문서 갱신을 먼저 합니다.
3. hardcoded runtime value로 문제를 메우지 않습니다.
4. unresolved를 fallback 값으로 숨기지 않습니다.
5. renderer store는 run summary와 visible slice만 우선 보존합니다.
6. 검증은 "어떤 실제 실패를 줄였는지" 기준으로 적습니다.

## 3. Patch 1 / Stage A

목표:

- `FetchSheetSnapshotSummary`를 구조화된 read contract로 유지합니다.
- 결과는 renderer state가 아니라 main-run artifact store에 먼저 저장합니다.

### 구현 체크리스트

- `FetchSheetSnapshotSummary`가 아래 필드를 포함하는지 확인
  - `readMode`
  - `retryReason`
  - `retryTrace`
  - `anchorSummary`
  - `hintSummary`
  - `validationSummary`
  - `failureCategory`
  - `coverage`
- `sheet-unconfigured`, token refresh, metadata load fail, full-range retry를 구조화된 reason으로 노출
- main 프로세스에 run artifact store 추가
- 시트 raw snapshot과 summary를 run id 기준으로 먼저 저장
- renderer에는 `runId + summary + visibleSlice`만 전달

### 먼저 손댈 파일

- 이 섹션의 과거 `app/` 파일 목록은 retired surface 기준이라 제거했습니다.
- 현재는 `app_v2/main/*`과 `src/io/sheets.fetch.js`를 기준으로 다시 매핑해야 합니다.

### Stage A 완료 조건

- 시트 읽기 실패가 `access / sheet-structure / mapping / value-parse` 중 하나로 분류됩니다.
- full-range retry가 발생했는지와 이유를 앱에서 알 수 있습니다.
- sheet snapshot 결과가 main-run artifact store에 먼저 저장됩니다.

### Stage A 검증 게이트

- 시트 미설정
- token refresh 필요
- metadata/named range 없음
- auto scan 실패 후 full-range retry
- provider value row 미검출

위 시나리오마다 failureCategory와 retryReason이 올바르게 채워지고, run id + visible slice가 응답돼야 합니다.

## 4. Patch 2 / Stage A 앱 상태 정리

목표:

- `sheetReadState`를 `summary + selectedRunId + visibleSlice` 중심으로 정리합니다.
- renderer store에 전체 rows를 상주시켜 두지 않습니다.

### 구현 체크리스트

- `SheetReadSnapshot`를 run id 기반 상태로 정리
- `sheetRead.logs` 같은 renderer 중복 보관 제거
- Settings surface는 summary와 visible slice를 소비
- 전체 sheet raw rows는 main artifact store에만 유지

### 먼저 손댈 파일

- 이 섹션의 과거 `app/renderer/*` 파일 목록은 retired surface 기준이라 제거했습니다.
- 현재는 `app_v2/renderer/*`와 관련 상태 저장소를 기준으로 다시 잡아야 합니다.

### Patch 2 완료 조건

- renderer sheetRead 상태에 raw rows가 없습니다.
- run 선택과 visible slice가 분리돼 있습니다.
- summary와 visible slice만으로 현재 시트 상태를 확인할 수 있습니다.

## 5. Patch 3 / Stage B

목표:

- 시트에서 읽은 raw field를 canonical term과 unresolved 상태로 분리합니다.

### 구현 체크리스트

- 아래 제품 타입 추가
  - `SheetRef`
  - `Anchor`
  - `SheetTerm`
  - `TermBinding`
  - `UnresolvedBinding`
- binding artifact 저장소 초안 작성
- 저장 위치는 로컬 우선, developer metadata는 보조 앵커로 사용
- unresolved queue를 숨기지 않고 surface에 노출

### 먼저 손댈 파일

- 이 섹션의 과거 `app/` 파일 목록은 retired surface 기준이라 제거했습니다.
- 현재는 `src/io/sheets.fetch.js`, `src/domain/sheet_domain.py`, `app_v2/main/*` 기준으로 다시 매핑해야 합니다.

### Patch 3 완료 조건

- raw와 canonical field가 함께 보존됩니다.
- unresolved mapping이 앱 surface와 export 경로에 명시적으로 존재합니다.
- binding artifact는 로컬 저장 우선 원칙을 따릅니다.

## 6. Patch 4 / Stage B 계산 격리

목표:

- compare / audit 계산을 renderer 직접 처리에서 main -> worker/subprocess 경계로 옮깁니다.

### 구현 체크리스트

- `sheet_domain.py`를 subprocess 호출 경계 후보로 정리
- inventory compare와 reservation audit 입력 payload 정의
- main이 run artifact를 조립하고 worker/subprocess에 전달
- renderer는 계산 결과와 visible slice만 받도록 조정

### 먼저 손댈 파일

- `src/domain/sheet_domain.py`
- 나머지 과거 `app/services/*` 파일 목록은 retired surface 기준이라 제거했습니다.
- 현재는 `app_v2/main/*` IPC/runtime 경계에서 다시 잡아야 합니다.

### Patch 4 완료 조건

- inventory compare와 reservation audit의 주 계산이 renderer 밖으로 이동합니다.
- subprocess 경계와 payload 비용이 검증됩니다.

## 7. Patch 5 / Stage C

목표:

- search runtime을 main/worker 쪽으로 옮기고 run별 index를 만듭니다.

### 구현 체크리스트

- `SearchDocument` 인덱스를 run 단위로 생성
- unresolved / evidence / anomaly를 같은 corpus에 포함
- renderer는 query를 보내고 `SearchHit[] + jumpTarget page`만 받음
- `app/services/searchEngine.ts`는 renderer 순수 계산기 역할을 제거하거나 이동

### 먼저 손댈 파일

- main search runtime/worker 파일
- 과거 `app/services/*`, `app/renderer/*` 파일 목록은 retired surface 기준이라 제거했습니다.
- 현재는 `app_v2/renderer/*`와 대응 main runtime 기준으로 다시 잡아야 합니다.

### Patch 5 완료 조건

- run별 SearchDocument 인덱스가 main/worker 쪽에서 생성됩니다.
- renderer는 검색 질의와 결과 페이지 소비에 집중합니다.
- unresolved / evidence / anomaly가 같은 검색 코퍼스에 포함됩니다.

## 8. Patch 6 / UI 경량화

목표:

- 현재 UI가 큰 결과를 오래 들고 있지 않도록 표면을 가볍게 만듭니다.

### 구현 체크리스트

- `AppHeader`, `RightPanel`, `TaskWorkspace` lazy load
- 대형 결과표 virtualization 처리
- embedding UI는 Stage D 전까지 넣지 않음

### 먼저 손댈 파일

- 이 섹션의 과거 `app/renderer/*` 파일 목록은 retired surface 기준이라 제거했습니다.
- 현재는 `app_v2/renderer/*` 기준으로 lazy-load와 virtualization 대상을 다시 잡아야 합니다.

### Patch 6 완료 조건

- 주요 큰 표면이 lazy load 됩니다.
- 대형 결과표는 virtualization 기준을 충족합니다.
- embedding UI가 본선에 조기 유입되지 않습니다.

## 9. Patch 7 / 재평가 조건

목표:

- Stage C 완료 시점 이후에도 문제가 남으면 Tauri는 본선이 아니라 스파이크로만 검증합니다.

### 재평가 체크리스트

- idle RAM
- peak RAM
- 배포 복잡도
- 운영자 체감

### Patch 7 완료 조건

- 기준 미달이면 `codex/...` 별도 브랜치에서 좁은 Tauri 스파이크만 수행
- 본선 마이그레이션은 실제 read / mapping / search 개선이 입증될 때만 검토

## 10. 구현 시 금지 패턴

- 새 hardcoded sheet 좌표를 코드에 직접 추가
- unresolved를 숨기는 dummy canonical 값 주입
- renderer store에 큰 rows를 다시 상주시켜 두는 변경
- jump target 없는 search 결과 확장
- embedding을 mapping core보다 먼저 주 경로에 연결하는 변경
- Tauri를 성능 근거 없이 본선 해결책처럼 도입하는 변경

## 11. 가장 먼저 착수할 실제 작업 묶음

후속 구현 첫 라운드는 아래 순서로 진행합니다.

1. Patch 1
- `app/contracts/provider.ts`
- `app/main/sheetRuntime.ts`
- `src/io/sheets.fetch.js`
- `app/main/runArtifactStore.ts`
- `app/main/ipc.ts`

2. Patch 2
- `app/renderer/types.ts`
- `app/renderer/state/uiStore.ts`
- `app/renderer/components/surfaces/SettingsSurface.tsx`

3. Patch 3
- mapping 타입과 unresolved queue 초안

4. Patch 4
- compare / audit 계산 경계 분리

5. Patch 5
- search main/worker 전환
