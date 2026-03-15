# GPT Handoff: Actual Sheet Scan / Mapping Status, Design Order, and Live Findings

Last updated: 2026-03-15

이 문서는 외부 GPT나 다른 구현 에이전트가 현재 작업을 이어받을 때 필요한 설계 기준, 실제 시트 분석 결과, 탐색 방향성, 주의사항을 한 번에 전달하기 위한 최신 handoff 문서입니다.

관련 기준 문서:

- [SHEET_MAPPING_SEARCH_BASELINE.md](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/docs/architecture/SHEET_MAPPING_SEARCH_BASELINE.md)
- [SHEET_MAPPING_SEARCH_EXECUTION_CHECKLIST.md](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/docs/architecture/SHEET_MAPPING_SEARCH_EXECUTION_CHECKLIST.md)
- [APP_PRODUCT_OPERATING_MODEL.md](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/docs/architecture/APP_PRODUCT_OPERATING_MODEL.md)

## 1. 지금 작업이 어디 단계인지

현재 단계는 다음입니다.

- `Stage A close-out preserved`
- `Stage B minimal local-first binding + minimal manual scan anchors implemented`
- 현재 활성 작업은 `actual live Google Sheet scan/mapping stabilization`

아직 아닌 단계:

- search runtime 개편
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

6. search/embedding은 아직 들어가면 안 된다.
- 실제 시트 구조와 mapping이 안정되기 전의 search/embedding은 core 문제를 덮는 방향으로 흐를 가능성이 높다

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

## 4. 실제 시트와 인증 상태

현재 실제로 쓰는 live sheet는 아래입니다.

- spreadsheet: `1q7mC5p0DKIFboiiOS_aQHoQLzdtszFb76-ntEvOvMj8`
- sheet: `2026`

현재 실제로 검증된 OAuth 상태:

- Google Sheets는 read-only scope만 사용
- 유효한 desktop OAuth client:
  - `/mnt/c/Users/anise/Downloads/client_secret_2_197214578423-9b9647iri321d86g9bvhpdm8sp73qf3b.apps.googleusercontent.com.json`
- 재사용 중인 token file:
  - `/mnt/c/Users/anise/OneDrive/바탕 화면/네이버 스테이션 변환/.google_oauth_token.json`
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

- [src/scan/normalize.js](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/src/scan/normalize.js)

이유:

- room-map header가 없는 본문 fallback range를 ROOM_MAP처럼 해석하던 문제 방지

효과:

- junk room map 생성 방지

### 7.2 fixed map이 없어도 room rows 유지

파일:

- [src/scan/blockBuilder.js](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/src/scan/blockBuilder.js)

이유:

- 실제 시트에서 fixed ROOM_MAP이 없어도 운영상 유효한 room rows를 살려야 함

효과:

- room signal 기반 room row survival

### 7.3 expected type count fallback

파일:

- [src/io/sheets.fetch.js](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/src/io/sheets.fetch.js)

이유:

- explicit expected counts가 0인데 detected counts는 있는 경우, validation이 무조건 0-count failure로 죽던 문제 완화

효과:

- detected data가 있는데 expected count 0만으로 전체가 실패하지 않음

### 7.4 shorthand inventory type detection

파일:

- [src/scan/aggregator.js](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/src/scan/aggregator.js)

이유:

- `Spa Suite 8인 / Suite 6인 / Suite 4인` shorthand를 기존 JS가 놓쳐서 live `GANGNAM/STATION` grand row가 typed slot에서 빠짐

효과:

- actual live `GANGNAM`에서 `STATION` typed rows가 `[22, 23, 21]` 로 잡히며 grand row가 유지됨

### 7.5 slot warning 진단 분리

파일:

- [src/io/sheets.fetch.js](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/src/io/sheets.fetch.js)

이유:

- 기존 `INVENTORY_DATA_ROW_SLOT_ORDER_INVALID` 가
  - 실제 잘못된 slot selection
  - typed slot은 맞지만 physical order만 다른 경우
  를 구분하지 못함

현재 규칙:

- complete manual type ranges가 있는 strict mode:
  - `INVENTORY_DATA_ROW_SLOT_ORDER_INVALID`
- relaxed/minimal-anchor mode:
  - `INVENTORY_DATA_ROW_PHYSICAL_ORDER_VARIANT`

효과:

- live `GANGNAM` warning이 generic slot failure가 아니라 structural variance로 읽힘

## 8. 현재 실제 상태

실제 live read 결과:

### COEX

- live read 성공
- blocking validation issue 없음

### GANGNAM

- live read 성공
- 현재 warning 1건
- warning code:
  - `INVENTORY_DATA_ROW_PHYSICAL_ORDER_VARIANT`

즉 지금은 “못 읽는 상태”가 아니라 “읽히지만 physical order variance가 남아 있는 상태”입니다.

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

- 실제 시트 scan/mapping이 안정되기 전의 search 강화는 얇은 문자열 필터/추천으로 core 문제를 가리는 방향이 될 수 있음

## 10. 고려해야 할 점

### 10.1 provider row와 typed row의 역할은 분리해서 봐야 한다

- provider row는 aggregate/value source 후보
- typed rows는 slot population 후보
- 같은 row가 두 역할 중 일부를 동시에 만족할 수도 있음

### 10.2 warning을 없애는 것보다 의미를 정확히 표현하는 것이 더 중요하다

- 현재 `PHYSICAL_ORDER_VARIANT` 는 남겨 두는 편이 맞다
- 이걸 억지로 제거하려는 패치는 실제 구조 편차를 숨길 위험이 큼

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

- search runtime 개편 착수
- embedding runtime 착수
- renderer에 raw rows/snapshot 재도입
- 새 hardcoded sheet 좌표 대량 추가
- physical order variance를 무조건 success/no-warning로 덮는 패치
- dummy canonical 값이나 fake room map 주입

## 12. 검증 방식

변경 후 검증은 아래처럼 해야 합니다.

기본 회귀:

- `node tests/regression_sheet_room_row_fallbacks.mjs`
- `node tests/regression_inventory_rows_and_color_map.mjs`
- `node tests/regression_sheets_fetch_boundaries.mjs`
- `node tests/regression_app_sheet_runtime_summary_builder.mjs`
- `npm run app:check`
- `npm run app:build`

실제 시트 검증:

- actual live read-only Google Sheet fetch
- spreadsheet `1q7mC5p0DKIFboiiOS_aQHoQLzdtszFb76-ntEvOvMj8`
- sheet `2026`
- 최소한 `COEX`, `GANGNAM` 둘 다 확인

## 13. 구현자에게 전달할 핵심 한 줄

이 작업은 “검색 엔진 고도화”가 아니라, `실제 시트 구조를 하드코딩 없이 읽고, 구조 variance를 정확히 진단하면서, 나중의 mapping/search/embedding이 올라갈 수 있는 scan/mapping 기반을 안정화하는 작업`입니다.
