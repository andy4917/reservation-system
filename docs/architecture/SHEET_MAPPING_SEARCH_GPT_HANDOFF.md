# GPT Handoff: Actual Sheet Scan / Mapping Status, Design Order, and Live Findings

Last updated: 2026-03-17

이 문서는 외부 GPT나 다른 구현 에이전트가 현재 작업을 이어받을 때 필요한 설계 기준, 실제 시트 분석 결과, 탐색 방향성, 주의사항을 한 번에 전달하기 위한 최신 handoff 문서입니다.

관련 기준 문서:

- [SHEET_MAPPING_SEARCH_BASELINE.md](./SHEET_MAPPING_SEARCH_BASELINE.md)
- [SHEET_MAPPING_SEARCH_EXECUTION_CHECKLIST.md](./SHEET_MAPPING_SEARCH_EXECUTION_CHECKLIST.md)
- [APP_PRODUCT_OPERATING_MODEL.md](./APP_PRODUCT_OPERATING_MODEL.md)

## 0. Latest Freeze For Next Session

다음 세션에서 바로 이어받아야 하는 최신 상태는 아래와 같습니다.

- 현재 완료 milestone:
  - `Milestone 1 schema close`
  - `Milestone 2 section segmentation runtime`
  - `Milestone 3 binding + unresolved persist/replay hardening`
  - `Milestone 4 bounded search assist`
  - `Milestone 5 repo-local live verification command`
- 현재 live section 판단:
  - `GANGNAM = active`
  - `COEX = active`
  - `BRANCH_THE_SEOLLEUNG = active`
  - `BRANCH_THE_SAMSEONG = preopen`
- 삼성점 처리 원칙:
  - live `scan.sections`에는 유지
  - 현재 운영 경로인 `mappingArtifacts`에서는 제외
  - 즉 "나중에 쉽게 다시 켤 수 있는 비활성화 상태"로 보관
- saved decision 저장 경로:
  - `sectionKey`를 decision persist/load 경로까지 반영함
  - decision replay는 stable sort 기반으로 동작
  - section-scoped unresolved anchor는 legacy decision anchor와도 호환
- 이번 세션에서 추가된 것:
  - `app/main/searchRuntime.ts` 기반 main-owned bounded search index
  - renderer 검색은 IPC query/hit 소비 구조로 전환
  - `scripts/live_sheet_verify.mjs`
  - `npm run app:verify:sheet-live`
- 다음 우선 작업:
  - Stage 4 export/operator loop contract 고정
  - full workerization이나 broad search UI 확장은 아직 보류

### 0.1 Fixed Narrow Stage 3 Boundary

다음 Stage 3는 “검색 엔진을 더 크게 만드는 단계”가 아니라, 이미 들어간 bounded search와 repo-local verify를 실제 운영 triage 경로에 연결하는 단계로 고정합니다.

- 고정 목표:
  - search와 recommendation이 unresolved triage, validation trace, evidence jump를 실제로 줄여 운영자의 다음 행동 결정을 빠르게 만든다.
- 포함 범위:
  - `SearchDocument`를 `unresolved binding`, `saved decision replay trace`, `validation/structural summary`, `inventory compare explanation`, `reservation audit explanation`, `live verify output`, `operator acceptance trace`로 재분류
  - 각 문서에 `kind`, `runId`, `sectionKey`, `source`, `jumpTarget`, `matchReason`, `candidateBasis`, `score`, `evidenceLineage`를 연결
  - recommendation은 `unresolved alias` 또는 `SheetTerm` 후보 triage 보조에만 1차 적용
  - acceptance / reject 저장에 `anchorId`, `termId` 또는 rejected candidate id, `candidateBasis`, `modelVersion`, `decidedAt`, `sectionKey`, `evidenceLineage`를 남김
  - verify output도 별도 디버그 출력이 아니라 evidence source 중 하나로 재사용
- 제외 범위:
  - broad search runtime 대개편
  - full workerization 선행 착수
  - broad search UI expansion
  - renderer에 raw rows, raw snapshot, 대형 matrix 재도입
  - embedding을 mapping core보다 먼저 주 경로에 연결하는 변경
  - recommendation을 canonical 확정값처럼 보이게 만드는 UI/저장 방식
- acceptance gate:
  - lexical + structured search가 `unresolved / evidence / validation / audit` line에 대해 실제 jump를 제공
  - recommendation이 unresolved triage 보조로 실제 화면에 연결
  - recommendation acceptance / reject가 측정 가능하게 저장
  - recommendation이 없어도 `read / compare / search`는 완결
  - repo-local verify 결과가 `sheet-unconfigured / failure / live-success` 분류와 함께 evidence source로 재사용

## 1. 지금 작업이 어디 단계인지

현재 단계는 다음입니다.

- `Stage A close-out preserved`
- `Stage B minimal local-first binding + minimal manual scan anchors implemented`
- 현재 활성 작업은 `actual live Google Sheet scan/mapping stabilization`

아직 아닌 단계:

- broad search runtime 개편
- embedding mapping
- Tauri 본선 검토
- broad UI expansion

이 순서는 고정입니다.

- `live read stabilization -> mapping core -> search assist -> embedding assist`

즉, 지금 작업은 “검색 엔진을 강화하는 단계”가 아니라, 검색/임베딩이 나중에 의미를 가지도록 실제 시트 scan/mapping 기반을 바로잡는 단계입니다.

## 2. 고정 설계 원칙

반드시 지켜야 할 기준은 아래입니다.

1. renderer는 얇게 유지한다.
- `summary + selectedRunId + visibleSlice`만 유지
- raw rows, raw snapshots, 대형 matrix를 renderer store에 다시 얹지 않는다

2. artifact는 main-owned store에 먼저 적재한다.
- 시트 run artifact
- saved binding decisions
- minimal manual scan anchors

3. unresolved는 숨기지 않는다.
- fake canonical 값 주입 금지
- fallback 성공처럼 보이게 덮기 금지
- 애매하면 unresolved로 남긴다

4. hardcoding은 최소 범위만 허용한다.
- 현재 허용된 manual scan anchors:
  - `dateRow`
  - `roomStartRow`
  - `inventorySearchStartRow`
  - `naverInventoryRow`
  - `stationInventoryRow`
- 이 범위를 넘어서는 좌표 고정은 매우 보수적으로 봐야 한다

5. 실제 시트 기준으로 검증한다.
- 시트 관련 구현은 live Google Sheet read 경로를 기준으로 판단
- 단위 테스트만으로 성공 판정하지 않는다

6. search/embedding은 아직 본선 확대하면 안 된다.
- 이번에 들어간 것은 `main-owned minimal bounded search assist` 뿐이다
- full workerization, semantic ranking, embedding recommendation은 아직 core 안정화 이후 범위다

## 3. 현재까지 구현된 것

### Stage A close-out

- `FetchSheetSnapshotSummary` 구조화 완료
- summary에는 다음이 포함됨
  - `retryReason`
  - `retryTrace`
  - `failureCategory`
  - `anchorSummary`
  - `hintSummary`
  - `validationSummary`
  - `coverage`
- 시트 결과는 main-owned run artifact store에 먼저 저장됨
- renderer `sheetRead`는 `summary + selectedRunId + visibleSlice`만 유지

### Stage B minimal draft

- 타입 추가
  - `SheetRef`
  - `Anchor`
  - `SheetTerm`
  - `TermBinding`
  - `UnresolvedBinding`
- main-owned binding store 구현
- generated unresolved draft + saved operator decision merge 구현
- Settings surface에 최소 unresolved/manual save-delete flow 추가

### Minimal manual scan anchors

- main-owned `scanAnchorStore` 구현
- saved manual anchors가 실제 sheetRuntime sync config에 overlay된 뒤 live sheet read 수행

### Stage C minimal bounded search assist

- `SearchDocument` / `SearchHit` 계약 추가
- main-owned `searchRuntime`이 run별 bounded corpus를 유지
- corpus에는 아래가 함께 포함됨
  - inventory compare rows
  - reservation audit rows
  - mapping artifact unresolved
  - sheet artifact lines
  - evidence / ops / validation / logs
- renderer는 더 이상 workspace state 전체를 직접 스캔하지 않고 query를 IPC로 보낸 뒤 hit만 소비함

### Stage C repo-local live verification

- `scripts/live_sheet_verify.mjs` 추가
- `npm run app:verify:sheet-live` 추가
- 이 명령은 app main의 `sheetRuntime`을 직접 재사용해 현재 로컬 설정 기준 live/unconfigured/failure classification을 그대로 출력함

## 4. 실제 시트와 인증 상태

현재 실제로 쓰는 live sheet는 아래입니다.

- spreadsheet: `1q7mC5p0DKIFboiiOS_aQHoQLzdtszFb76-ntEvOvMj8`
- sheet: `2026`

현재 실제로 검증된 OAuth 상태:

- Google Sheets는 read-only scope만 사용
- 유효한 desktop OAuth client:
  - 로컬 비공개 desktop OAuth client JSON
- 재사용 중인 token file:
  - 로컬 비공개 token file
- 문제였던 것은 권한 범위가 아니라 OAuth client mismatch였고, 현재는 해결됨

따라서 지금의 병목은 인증이 아니라 실제 시트 scan/mapping 입니다.

## 5. 실제 시트를 보며 파악한 구조적 특징

이 섹션이 가장 중요합니다. 이후 구현자는 이 특징을 기준으로 판단해야 합니다.

### 5.1 한 탭 안에 branch section이 둘 이상 있다

시트 `2026` 안에 branch section이 분리되어 존재합니다.

- `GANGNAM`
  - section title 근처 row `1`
  - `TYPE/ROOM` 근처 row `4`
- `COEX`
  - section title 근처 row `62`
  - `TYPE/ROOM` 근처 row `65`

즉, 한 sheet tab 전체를 단순히 한 branch처럼 읽으면 안 됩니다.

### 5.2 유효한 SCAN_CONFIG/ROOM_MAP 힌트가 사실상 없다

실제 path에서는 아래 문제가 있었습니다.

- usable `SCAN_CONFIG` named range 없음
- usable `ROOM_MAP` named range 없음
- metadata 기반 anchor도 충분하지 않음

그래서 자동 탐지가 흔들릴 때, named range나 metadata가 바로 문제를 해결해 주지 못합니다.

### 5.3 fallback ROOM_MAP 해석은 매우 위험하다

이전 문제 중 하나는 `ROOM_MAP` named range가 없을 때 본문 fallback range를 ROOM_MAP처럼 읽으면서 junk mapping이 생기던 것입니다.

현재 파악된 원칙:

- 명시적인 room-map header가 없으면 room-map으로 간주하면 안 된다
- sheet body rows를 room-map처럼 해석하면 잘못된 mapping이 만들어진다

### 5.4 room row 생존은 fixed room map만으로 판단하면 안 된다

실제 시트는 `ROOM_MAP`이 없더라도 운영상 유효한 room rows를 갖고 있습니다.

따라서 room row 판단에서 필요한 것은:

- room label
- room signal
  - 색상
  - note
  - closed/status text
  - 실제 날짜 컬럼에 존재하는 운영 데이터

즉, fixed map이 없더라도 operational row signal을 같이 봐야 합니다.

### 5.5 provider aggregate row도 실제 값 source일 수 있다

실제 강남/코엑스 시트에서는 provider row 자체가 유효한 inventory value source인 경우가 있습니다.

예를 들어:

- `STATION` provider row 자체에 파싱 가능한 inventory 값이 들어있음
- 그 아래 typed rows도 존재함

따라서 “provider row와 typed row가 둘 다 있으니 provider row는 버려야 한다”는 판단은 위험합니다.

### 5.6 room label이 canonical English full-name이 아닐 수 있다

실제 시트 label 예시:

- `Spa Suite 8인`
- `Suite 6인`
- `Suite 4인`

즉:

- `grand`
- `urban`
- `double twin`

같은 canonical English token이 항상 존재하지 않습니다.

따라서 최소한 아래 정도는 타입 감지에 들어가야 했습니다.

- `8인 -> grand`
- `6인 -> urban`
- `4인 -> doubleTwin`

### 5.7 physical row order와 canonical slot order는 다를 수 있다

실제 시트에서는 typed slot이 모두 잡혀도 물리 row order가 canonical slot order와 다를 수 있습니다.

예:

- canonical slot order 기대: `urban -> doubleTwin -> grand`
- 실제 시트 물리 row는 다른 순서일 수 있음

이건 “데이터를 잘못 골랐다”와 같은 문제가 아닐 수 있습니다.

그래서 이후 진단에서는 아래를 분리해야 합니다.

- typed slot completeness
- duplicate 여부
- physical row order variance

## 6. 실제 branch별 live read에 필요한 최소 manual anchors

현재 live read 성공에 사용된 최소 manual anchors는 아래와 같습니다.

### GANGNAM

- `dateRow=4`
- `roomStartRow=6`
- `inventorySearchStartRow=21`
- `stationInventoryRow=21`
- `naverInventoryRow=24`

### COEX

- `dateRow=65`
- `roomStartRow=67`
- `inventorySearchStartRow=115`
- `stationInventoryRow=115`
- `naverInventoryRow=120`

이 값들은 현재 live path 검증용 최소 anchor이며, 새 hardcode를 더 늘리는 근거로 쓰면 안 됩니다.

## 7. 최근 실제 수정과 그 이유

### 7.1 headerless ROOM_MAP 방지

파일:

- [src/scan/normalize.js](../../src/scan/normalize.js)

이유:

- room-map header가 없는 본문 fallback range를 ROOM_MAP처럼 해석하던 문제 방지

효과:

- junk room map 생성 방지

### 7.2 fixed map이 없어도 room rows 유지

파일:

- [src/scan/blockBuilder.js](../../src/scan/blockBuilder.js)

이유:

- 실제 시트에서 fixed ROOM_MAP이 없어도 운영상 유효한 room rows를 살려야 함

효과:

- room signal 기반 room row survival

### 7.3 expected type count fallback

파일:

- [src/io/sheets.fetch.js](../../src/io/sheets.fetch.js)

이유:

- explicit expected counts가 0인데 detected counts는 있는 경우, validation이 무조건 0-count failure로 죽던 문제 완화

효과:

- detected data가 있는데 expected count 0만으로 전체가 실패하지 않음

### 7.4 shorthand inventory type detection

파일:

- [src/scan/aggregator.js](../../src/scan/aggregator.js)

이유:

- `Spa Suite 8인 / Suite 6인 / Suite 4인` shorthand를 기존 JS가 놓쳐서 live `GANGNAM/STATION` grand row가 typed slot에서 빠짐

효과:

- actual live `GANGNAM`에서 `STATION` typed rows가 `[22, 23, 21]` 로 잡히며 grand row가 유지됨

### 7.5 slot warning 진단 분리

파일:

- [src/io/sheets.fetch.js](../../src/io/sheets.fetch.js)

이유:

- 기존 `INVENTORY_DATA_ROW_SLOT_ORDER_INVALID` 가
  - 실제 잘못된 slot selection
  - typed slot은 맞지만 physical order만 다른 경우
  를 구분하지 못함

현재 규칙:

- complete manual type ranges가 있는 strict mode:
  - `INVENTORY_DATA_ROW_SLOT_ORDER_INVALID`
- relaxed/minimal-anchor mode:
  - 기본적으로 `INVENTORY_DATA_ROW_PHYSICAL_ORDER_VARIANT`
  - 단, provider row가 selected typed-slot source인 경우에는 warning으로 승격하지 않고 structural summary에만 남김

효과:

- live `GANGNAM`은 validation warning 없이 통과하고, `physicalOrderVariant=true`만 structural summary에 남음

### 7.6 GANGNAM local header 우선 room type 판정

파일:

- [src/scan/blockBuilder.js](../../src/scan/blockBuilder.js)
- [src/io/sheets.fetch.js](../../src/io/sheets.fetch.js)

이유:

- `GANGNAM`은 `A/B 1~5행` 고정 헤더 뒤에 9객실 구조를 갖는데
- shared `ROOM_MAP` fallback이 `401/501/1101/1102` 같은 room no를 `COEX` 기준으로 먼저 해석하면서
  - `ROOM_TYPE_COUNT_MISMATCH`
  - `ROOM_ROWS_INSUFFICIENT`
  가 생겼음

현재 규칙:

- 시트 local room type header가 있고 room signal이 확인되면 shared ROOM_MAP보다 local header를 우선
- sheet hint room map이 없을 때 expected type count fallback도 local header 기반 room map을 사용

효과:

- actual live `GANGNAM`에서
  - `expectedTypeCounts={urban:1,doubleTwin:1,grand:7}`
  - `detectedTypeCounts={urban:1,doubleTwin:1,grand:7}`
  - `expectedRoomCount=9`
  - `detectedRoomCount=9`

### 7.7 RAW_DERIVED closed-row 비교식 정리

파일:

- [src/engine/rules.js](../../src/engine/rules.js)

이유:

- live mismatch의 실제 샘플은 전부
  - `raw="닫음"`
  - `derived="0/0"`
  였음
- 원인은 NAVER derived 계산이 local vacancy `0` 때문에 total까지 `0`으로 줄여 버리던 비교식이었음

현재 규칙:

- NAVER closed row derived는 local vacancy 0으로 `0/0`을 만들지 않고
- provider fixed maximum(weekday `4`, Fri/Sat `3`) 기준으로 정규화

효과:

- `COEX`, `GANGNAM` 둘 다 `RAW_DERIVED_VALUE_MISMATCH` 제거
- live 재검증 기준 `rawDerivedMismatchCount=0`

### 7.8 main-owned bounded search assist 추가

파일:

- [app/main/searchRuntime.ts](../../app/main/searchRuntime.ts)
- [app/renderer/state/uiStore.ts](../../app/renderer/state/uiStore.ts)
- [app/services/searchEngine.ts](../../app/services/searchEngine.ts)

이유:

- Stage C 계약의 최소 범위로 run별 search corpus를 renderer direct-scan에서 main-owned index로 옮겨야 했음
- 단, broad search runtime 개편까지 벌리지 않고 current artifact/runtime만 재사용하는 bounded assist가 필요했음

현재 규칙:

- run별 corpus는 최대 개수 제한이 있는 bounded 문서 집합으로 유지
- unresolved / evidence / validation / logs가 같은 corpus에 들어감
- renderer는 query string과 `SearchHit[]`만 소비

효과:

- 검색이 현재 run artifact 중심으로 고정됨
- renderer가 큰 workspace state를 매 타이핑마다 직접 스캔하지 않음
- unresolved triage와 artifact line 검색이 같은 경로에서 가능해짐

### 7.9 repo-local live verification command 추가

파일:

- [scripts/live_sheet_verify.mjs](../../scripts/live_sheet_verify.mjs)
- [package.json](../../package.json)

이유:

- Stage C 계약의 마지막 미충족 항목이 저장소 내부에서 바로 실행 가능한 live sheet verify command였음

현재 규칙:

- `sheetRuntime`을 그대로 재사용
- `--start-date`, `--end-date`, `--branch`, `--json` 인자를 지원
- 로컬 `UHS_SYNC_CONFIG_JSON`이 없으면 `sheet-unconfigured`를 그대로 출력

효과:

- 이후 구현자는 “지금 시트 런타임이 실제로 무엇을 보고 실패했는지”를 repo-local command로 바로 확인할 수 있음

## 8. 현재 실제 상태

실제 live read 결과:

### COEX

- live read 성공
- validation issue 0건

### GANGNAM

- live read 성공
- validation issue 0건
- structural summary에는 `physicalOrderVariant=true`가 남아 있음
- 현재는 “못 읽는 상태”가 아니라 “validation clean 상태이며 구조 variance는 summary로만 남아 있는 상태”입니다

추가 상태:

- Stage C minimal 계약은 현재 닫혔음
- 2026-03-17 기준 좁은 `Stage 3 Search / Recommendation 실제화` 계약도 현재 닫혔음
- 다음 활성 범위는 `Stage 4 Evidence / Export / Operator Loop`이며, external handoff/file export/clipboard/replay view는 아직 후속 구현임

## 9. 앞으로의 탐색 방향성

이후 구현자는 아래 방향을 유지해야 합니다.

### 방향성 1. 실제 시트 구조를 받아들이는 쪽으로 간다

의미:

- canonical slot order를 실제 시트에 강제로 맞추게 만들지 않는다
- 실제 시트가 합리적으로 읽히는 한, 구조 variance는 진단으로 남기되 전체 실패로 확대하지 않는다

### 방향성 2. 자동 탐지보다 구조-aware 진단을 강화한다

의미:

- “왜 실패했는지”를 더 정확히 쪼개는 것이 중요함
- 예:
  - hint 부재
  - room-map 부재
  - typed slot missing
  - provider row/value source mismatch
  - physical order variance

### 방향성 3. manual anchor는 최소 범위만 유지한다

의미:

- branch별 live read를 닫기 위해 필요한 최소 row anchors까지만 허용
- provider type range 전체 고정, room range 전체 고정 같은 방향은 신중해야 함

### 방향성 4. search/embedding으로 core 문제를 덮지 않는다

의미:

- 이번 bounded search는 허용된 최소 보조 기능이다
- 다음 단계에서도 search를 broad ranking/semantic runtime으로 급확장하면 다시 core 문제를 가릴 수 있음

## 10. 고려해야 할 점

### 10.1 provider row와 typed row의 역할은 분리해서 봐야 한다

- provider row는 aggregate/value source 후보
- typed rows는 slot population 후보
- 같은 row가 두 역할 중 일부를 동시에 만족할 수도 있음

### 10.2 warning을 없애는 것보다 의미를 정확히 표현하는 것이 더 중요하다

- 현재는 validation warning 자체는 제거했지만
- `physicalOrderVariant=true` structural summary는 유지한다
- 즉 실제 구조 편차를 숨기지 않고, “실패/경고 판정”과 “구조 메타데이터”를 분리하는 방향이 맞다

### 10.3 branch-aware reasoning이 필요하다

- 한 탭 안에 branch section이 여러 개 있으므로
- 한 branch에서 맞는 scan anchor나 provider row rule이 다른 branch에도 그대로 맞는다고 보면 안 된다

### 10.4 실제 시트 구조는 canonical 정책보다 먼저 존재한다

- canonical mapping은 실제 구조를 설명/정리해야지
- 실제 구조를 canonical schema에 강제로 끼워 맞추는 방식이면 다시 hardcode가 늘어난다

### 10.5 unresolved는 계속 제품 상태로 남겨야 한다

- structure variance
- hint 부재
- mapping 미완성
- 이런 것들을 “조용히 성공”으로 바꾸면 안 된다

## 11. 구현할 때 피해야 할 것

- bounded scope를 넘어서는 search runtime 대개편 착수
- embedding runtime 착수
- renderer에 raw rows/snapshot 재도입
- 새 hardcoded sheet 좌표 대량 추가
- structural summary까지 지워서 physical order variance 자체를 은폐하는 패치
- dummy canonical 값이나 fake room map 주입

## 12. 검증 방식

변경 후 검증은 아래처럼 해야 합니다.

기본 회귀:

- `node tests/regression_sheet_room_row_fallbacks.mjs`
- `node tests/regression_inventory_rows_and_color_map.mjs`
- `node tests/regression_sheets_fetch_boundaries.mjs`
- `node tests/regression_app_sheet_runtime_summary_builder.mjs`
- `node tests/regression_app_search_runtime.mjs`
- `node tests/regression_app_search_process_modules.mjs`
- `npm run app:check`
- `npm run app:build`

repo-local verify:

- `npm run app:verify:sheet-live -- --start-date 2026-03-12 --end-date 2026-03-12 --branch GANGNAM`
- live 설정이 없을 때는 `sheet-unconfigured`도 정상 결과로 간주하고, failure classification이 맞는지만 먼저 확인

실제 시트 검증:

- actual live read-only Google Sheet fetch
- spreadsheet `1q7mC5p0DKIFboiiOS_aQHoQLzdtszFb76-ntEvOvMj8`
- sheet `2026`
- 최소한 `COEX`, `GANGNAM` 둘 다 확인

## 13. 구현자에게 전달할 핵심 한 줄

이 작업은 “검색 엔진 고도화”가 아니라, `실제 시트 구조를 하드코딩 없이 읽고 구조 variance를 정확히 진단하면서, minimal bounded search와 repo-local verify까지만 얹어 다음 mapping/search/embedding 단계가 올라갈 수 있는 기반을 안정화하는 작업`입니다.
