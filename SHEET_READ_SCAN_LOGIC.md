# 시트 읽기/스캔/규칙/계산/결과 로직 통합본

이 문서는 현재 프로젝트의 시트 처리 로직을 한 파일로 통합한 문서다.

- 1부: 확장 프로그램(`src/content.js`) 기준 로직
- 2부: Python CLI(`reservation_sheet_audit.py`, `reservation_sheet_sync.py`) 기준 로직

---
## 1부) 확장 프로그램 로직


이 문서는 현재 확장 코드(`src/content.js`)가 Google Sheet를 읽고, 스캔하고, 규칙을 적용해 목표값을 계산하고, OTA 반영 결과를 만드는 전체 흐름을 정리한 문서다.

## 1) 진입점

- `loadSheetInventory()`
  - 시트 스냅샷을 읽고, 화면용 시트 재고/불일치/디버그 정보를 만든다.
- `runSheetSync()`
  - 시트 스냅샷 + 사이트 재고를 비교해 적용 액션을 만들고, 실제 API 반영(ON일 때)까지 수행한다.

핵심 계산은 둘 다 `fetchSheetSnapshot()` + `buildSyncPreviewFromData()`를 공유한다.

## 2) 입력과 설정 병합

### 2-1. 기본 설정

- 기본 시트/연도/시작행: `DEFAULT_SPREADSHEET_ID`, `DEFAULT_SHEET_NAME`, `DEFAULT_START_ROW`, `DEFAULT_YEAR`
- 기본 스캔 설정: `DEFAULT_SCAN_CONFIG`
  - 자동/수동 모드
  - 날짜행/요일행/날짜 시작열/끝열
  - 객실 시작행
  - 타입 범위(Urban/Double/Grand)
  - 재고 탐색 시작행, NAVER/STATION 재고행

### 2-2. 설정 소스

- UI/저장소 설정(`SYNC_CFG_KEY`)
- 임베디드 설정(`EMBEDDED_AUTH`, `EMBEDDED_AUTH_MODE`)
- 시트 힌트(`SCAN_CONFIG`, `ROOM_MAP` + developer metadata)

### 2-3. 우선순위 규칙

- `loadSheetReadHints()`에서
  - `SCAN_CONFIG` 값 표 + metadata를 읽어 스캔 설정을 만든다.
  - 병합 시 metadata 값이 우선한다.
  - grid에서 좌표 오버라이드가 있거나 metadata가 manual이면 mode를 manual로 고정한다.
- `resolveEffectiveScanConfig(userScan, sheetScan)`에서
  - 사용자 설정이 manual이면 사용자 설정 우선
  - 아니고 시트 힌트가 manual이면 힌트 우선
  - 그 외는 사용자 설정 유지

## 3) 시트 로드(fetchSheetSnapshot) 전체 흐름

## 3-1. 토큰 확보

- `ensureGoogleAccessToken()`
  - access token 유효하면 사용
  - 만료/부재 시 refresh token으로 갱신
  - 401/403이면 1회 강제 재시도

## 3-2. 빠른 범위 조회 + 전체 조회 폴백

- 기본은 Fast scan:
  - 기준행(anchor): manual dateRow 또는 `startRow`
  - `SHEET_GRID_FAST_ROW_LIMIT`(260행) 범위만 먼저 조회
- 아래 조건이면 Full scan(`A1:끝열`) 재시도:
  - grid 미수신
  - auto 모드에서 날짜/재고 탐지 실패
  - 현재 provider의 재고행 또는 재고값을 못 찾은 경우
  - 내부 파싱 예외 발생

## 3-3. Matrix 구성(buildSheetMatrix)

- 시트 API의 `rowData`를 내부 matrix로 변환한다.
- 숨김행(`hiddenByUser`/`hiddenByFilter`)은 `hiddenRows`로 기록한다.
- 병합셀(`merges`) 처리:
  - 병합 내부 셀에 값이 비어 있으면 anchor 셀 값을 상속해서 읽는다.

## 4) 날짜 열 탐지(findDateColumns)

날짜 라벨 형식: `N월 N일`

탐지 순서:

1. manual mode + dateRow 지정: 그 행 우선
2. 힌트 위치 고정 탐색: (65행/66행, BA열 기준 힌트)
3. fallback: startRow부터 내려가며 가장 날짜 컬럼 수가 많은 행 선택

검증:

- 날짜 열이 7개 미만이면 오류
- 요일 라벨은 날짜행 다음 행(또는 manual weekdayRow)에서 읽음

## 5) 스캔 범위 계산

- `roomStartRow`:
  - 수동 지정값 우선, 없으면 `dateRow + 2`
- `inventorySearchStartRow`:
  - 수동 지정값 우선, 없으면 `dateRow + 2`
- `roomScanEndRow`:
  - 수동 타입 범위의 end가 있으면 그 최대값
  - 아니면 인벤토리 행 최소값 - 1
  - 아니면 `roomStartRow + 180`(상한 `matrix.maxRow`)

## 6) 인벤토리 행 탐지(findInventoryRows)

- alias 기준 탐색:
  - STATION: `station`, `스테이션`, `uh suite`
  - NAVER: `naver`, `네이버`
- 숨김행은 제외
- manual mode에서 provider 재고행을 직접 입력한 경우:
  - 자동 탐색을 생략하고 지정 행을 사용

## 7) provider별 데이터 행 수집(collectProviderInventoryDataRows)

- 각 provider의 재고 기준행부터 최대 20행 범위에서 수집
- 제외 조건:
  - 합계/total/room sold 등 요약 라벨 행
  - 날짜열 전체가 빈 행
  - 다음 provider alias 행을 만나면 중단
- 기본 최대 3행 수집
  - 이후 room preset 순서대로 (Urban, Double, Grand) 매핑

## 8) 셀 상태 분류 규칙(classifySheetCellStatus)

분류값: `VAC`, `VIP`, `OOO`, `MARKETING`, `OTHER`, `EMPTY`

핵심 규칙:

- `VAC`, `VIP`, `OOO`, `마케팅/MARKETING`은 텍스트로 직접 판정
- note가 있으면 `OTHER` (예약 블록으로 간주)
- 예약색 팔레트 색상이면 `OTHER`
- 일반 텍스트만 있고 예약 신호 없으면 `EMPTY`
- 완전 빈 셀은 `VAC`로 처리
  - 시트의 `COUNTIF(...,"VAC")` 기반 공실 계산과 맞추기 위한 의도적 규칙

## 9) 객실행/타입 인식

### 9-1. 기본 맵

- `ROOM_TYPE_BY_ROOM_NO`로 객실번호→타입 매핑
- 기본 룸 프리셋:
  - NAVER: `6556948`, `6556938`, `7043386`
  - STATION: `62`, `59`, `258`

### 9-2. 수동 타입 범위가 있으면 파티션 스캔 우선

- Urban/Double/Grand 범위를 이용해 행을 강제 분할
- 룸번호 패턴(숫자/A prefix)도 같이 검사

### 9-3. 자동 스캔

- room no/room type 열을 따라 내려가며 행 수집
- skip token(합계/total/naver/station 등) 행 제외
- 필요 시 current room type 문맥 계승

## 10) 재고값 파싱/정규화

## 10-1. parseStockValue

- `a/b` 형식: `current=a`, `maximum=b`
- 숫자 단일값: `current=n`, `maximum=null`
- 그 외: 파싱 실패(`current/max=null`)

## 10-2. provider 최대값 고정 규칙(applyProviderMaximumRule)

- STATION: 최대값 고정 1
- NAVER:
  - 금/토: 최대값 3
  - 나머지: 최대값 4

`닫음/마감/closed/off/x`류 텍스트면 강제로 `current=maximum=fixedMax` 처리한다.

## 10-3. 화면 표시 정규화

- `normalizeDisplayInventoryValue()`:
  - 닫힘 텍스트 또는 `current>=maximum`이면 표시를 `닫음`으로 통일

## 11) 객실 상태 기반 자동보정(buildDerivedRoomValuesFromSheetState)

이 단계는 시트에서 읽은 provider 데이터행(`naverDataRows`/`stationDataRows`)을 객실 상태 분포와 대조해 room별 값을 자동 보정한다.

### 11-1. 타입별/날짜별 통계

- `summarizeRoomTypeStatsByDate()`에서 타입별로:
  - total, vac, vip, marketing, ooo, other, empty 집계
- 핵심 계산식:
  - `예약(sold) = 총객실(expectedTotal) - (VAC + VIP + MARKETING + OOO)`
  - `공실(vacancy) = VAC`

### 11-2. provider 최대값 스케일링

- NAVER/STATION처럼 fixed max가 있는 경우:
  - `soldScaled = round((rawSold/rawTotal) * fixedMax)`
  - available = `fixedMax - soldScaled`

### 11-3. 출력 포맷 추론

- 기존 값이 분수형이 하나라도 있으면 분수 유지
- 숫자형만 있으면:
  - 기존 숫자가 sold에 가까운지, available에 가까운지 비교 후 포맷 결정
  - `numeric-current` 또는 `numeric-available`

### 11-4. 보정 판정

- `areInventoryRawsEquivalent()`로 정규화 비교
- 다르면 `corrected=true`, `originalRaw` 보관, 보정 카운트 증가

결과는 `snapshot.naverRoomValues`, `snapshot.stationRoomValues`, `snapshot.derivedCorrections`에 저장된다.

## 12) 목표값 계산(buildTargetMap)

실제 OTA 적용용 목표는 room별 보정값이 아니라 provider 대표값(`snapshot.naverValues`/`snapshot.stationValues`)에서 계산한다.

`inventoryValueToTargetUnits(inv, mode, providerKey, dateKey)` 규칙:

- 닫힘 텍스트면 목표 0
- `current >= maximum`이면 강제 0(닫힘)
- mode=`available`:
  - current/max 모두 있으면 `maximum-current`
  - current만 있으면 `current`
  - max만 있으면 `max`
- mode=`current`:
  - current 우선, 없으면 max
- 마지막 폴백: raw에서 첫 숫자
- 전부 실패 시 null(해당 일자 제외)

## 13) 목표 검증(analyzeTargetMap)

검증 결과:

- `UNPARSEABLE_CELL`(error): 셀 해석 불가
- `NEGATIVE_TARGET`(error): 음수 목표
- `CURRENT_EXCEEDS_MAXIMUM`(warn): 현재값이 최대 초과

`runSheetSync()`에서는 error가 1건 이상이면 실제 적용 중단한다.

## 14) OTA 액션 계획

### 14-1. STATION(planStationActions)

- 일자별 목표 units에 대해 room별 0/1 할당(`allocateRoomUnits`)
- 기존 open stock 유지 우선, 필요 시 재할당
- payload:
  - `branchId`, `priceSetId`, `applyDates`, `roomSettingStocks[]`
- `mismatchCount`는 실제 조정이 필요한 room 수 기준

### 14-2. NAVER(planNaverActions)

- `allocateRoomUnitsFlexible()`로 목표 units를 room별 분배
- 두 종류 액션 생성:
  - `stock` 변경
  - `sale-day` open/close 변경

## 15) 결과 생성/표시

## 15-1. 시트 조회 결과(loadSheetInventory)

- `reloadSheetSnapshot()` 후 `buildSheetValueModel()`로 표 렌더링 데이터 생성
- 불일치:
  - `buildMismatchRowsFromLoadedValues()`에서 사이트값 vs 시트값 텍스트 비교
- 디버그 출력:
  - 스캔 위치(date row/col, room row range, inventory row)
  - 타입행/분할 감지 수
  - 셀 상태 통계(VAC/EMPTY/OTHER 등)
  - 보정 건수(`derivedCorrections.count`)

## 15-2. 동기화 결과(runSheetSync)

- 미리보기 결과:
  - `totalCount` = mismatchCount
  - `closedCount`, validation 에러/경고 표시
- 실제 적용 ON일 때:
  - provider API 호출 결과(`APPLIED/FAILED/SKIPPED_NO_CHANGE`) 집계
  - 적용 후 재조회 + 재검증 수행
  - 최종 성공/실패/오류건 렌더링

## 16) 주요 산출물(snapshot 구조)

`fetchSheetSnapshot()` 반환 핵심 필드:

- `dateCols`
- `inventoryRows` (NAVER/STATION 기준 행)
- `inventoryDataRows` (실제 데이터행 배열)
- `naverValues`, `stationValues` (대표 행 값)
- `naverRoomValues`, `stationRoomValues` (보정 반영 room별 값)
- `derivedCorrections` (count/roomTypeMap/diagnostics)
- `scan` (최종 적용 스캔 위치 요약)
- `readHints` (SCAN_CONFIG/ROOM_MAP fingerprint 포함)

## 17) 운영상 주의점

- auto 모드는 탐지 실패 시 full-range 재시도로 복구하지만, 시트 구조가 크게 바뀌면 manual 좌표를 명시해야 안정적이다.
- 타입 분할 감지가 기준 수와 다르면 보정치가 달라질 수 있어 디버그의 타입행/분할 카운트를 우선 점검해야 한다.
- `stockMode`(`available`/`current`)에 따라 목표값 해석이 달라져 적용 결과가 크게 바뀐다.


---

## 2부) Python CLI 로직


이 문서는 현재 Python 도구(`reservation_sheet_audit.py`, `reservation_sheet_sync.py`) 기준으로,
Google Sheet를 읽고 스캔한 뒤 규칙을 적용해 계산하고 결과 파일을 만드는 전체 흐름을 정리한 문서다.

범위:

- 읽기/분석 CLI: `reservation_sheet_audit.py`
- 동기화 CLI: `reservation_sheet_sync.py`

## 1) 진입점

## 1-1. 읽기/분석

- `reservation_sheet_audit.py analyze`
  - 시트 구조/예약 블록/VAC/채널 추천/대조 리포트를 생성한다.
- `reservation_sheet_audit.py analyze-current`
  - 토큰이 없거나 만료면 OAuth 자동 발급을 먼저 수행한 뒤 `analyze`를 실행한다.

## 1-2. 동기화

- `reservation_sheet_sync.py`
  - 시트 인벤토리 행 값을 읽어 target units를 계산하고,
  - STATION/NAVER API 적용 액션(또는 dry-run 요약)을 생성한다.

## 2) 공통 인증/입력 처리

## 2-1. 액세스 토큰 획득(`get_access_token`)

우선순위:

1. `--access-token`
2. 환경변수 `GOOGLE_ACCESS_TOKEN`
3. `--token-file` JSON(`.google_oauth_token.json` 기본)

토큰 파일 로직:

- `access_token` 유효(`token_is_valid`)하면 즉시 사용
- 만료 시 `refresh_token`으로 갱신(`refresh_access_token`)
- `client_secret` 우선순위:
  - `--client-secret`
  - `GOOGLE_CLIENT_SECRET`
  - token file 내 `client_secret`

## 2-2. 시트 ID/이름 결정

- `extract_sheet_id()`로 URL/ID 모두 허용
- `--sheet-name`이 비어 있으면 `--gid`로 실제 시트명 조회

## 2-3. GridData 조회 폴백

`command_analyze()`와 `load_sheet_snapshot()` 공통:

- 먼저 `--start-row` 기준으로 GridData 조회
- 실패하면 `A1`(start row 1)로 재조회
- `find_date_columns`가 실패해도 `A1` 재조회 후 한 번 더 탐색

## 3) 시트 매트릭스와 스캔 기본 규칙

## 3-1. SheetMatrix

- API `rowData`를 `(row,col) -> Cell` 맵으로 만든다.
- `Cell` 구성:
  - `formatted_value`, `note`, `background_color`, `background_hex`, `borders`

## 3-2. 날짜 열 탐색(`find_date_columns`)

탐색 방식:

1. 고정 힌트 위치 우선: 65행(날짜), 66행(요일), BA열 probe
2. 실패 시 start row 이후에서 날짜 라벨(`N월 N일`)이 가장 많은 행 선택

검증:

- 날짜 열이 7개 미만이면 오류
- 요일 라벨은 날짜행+1에서 수집

## 3-3. 재고행 탐색(`find_inventory_rows`)

- 행 A/B열 텍스트 alias 매칭
- STATION: `station`, `스테이션`, `uh suite`
- NAVER: `naver`, `네이버`

## 3-4. 재고값 파싱(`parse_stock_value`)

- `a/b` -> `current=a`, `maximum=b`
- 숫자 단일값 -> `current=n`, `maximum=None`
- 그 외 -> `current=None`, `maximum=None` (미파싱)

## 4) 읽기/분석 CLI(`reservation_sheet_audit.py`) 상세

## 4-1. 객실 행 인식(`map_room_rows`)

핵심 규칙:

- room no(B열)가 없으면 제외
- 합계/total/sold/naver/station 텍스트가 있는 행 제외
- 숫자 없는 room no 제외
- 날짜 열 구간에 값 또는 note가 하나도 없으면 제외
- room type은 우선순위로 결정:
  - `ROOM_TYPE_BY_ROOM_NO` 명시 맵
  - 현재 room type 문맥(A열)
  - 없으면 `UNKNOWN_ROOM_TYPE`

## 4-2. 예약 블록 추출(`extract_reservation_blocks`)

1차:

- 병합셀(`merges`) 기준으로 블록 생성
- 단일 행 병합만 대상
- note 없는 블록은 제외

2차:

- 병합으로 커버되지 않은 셀 중 note가 있는 단일 셀을 1박 블록으로 추가

플랫폼 분류(`classify_platform`):

- 배경색 팔레트로 1차 분류
- 다중 후보 색상은 HAR 예약번호/노트 텍스트로 해소
- 해소 실패 시 `AMBIGUOUS(...)` 또는 `UNKNOWN_COLOR(...)`

## 4-3. 일별 통계 계산

- `calculate_daily_stats`
  - 상태 분류(`classify_cell_status`)로 일자별 VAC/VIP/MARKETING/OOO 집계
  - `sold = total_rooms - VAC`
- `calculate_vac_by_room_type`
  - room type별 VAC count 집계

## 4-4. 채널 추천 계산(`calculate_channel_recommendations`)

입력:

- 일별 통계
- 시트 내 기존 NAVER/STATION 인벤토리 행
- `--vac-share-limit`

핵심 규칙:

- 만실(`sold >= total_rooms`)이면 N/S 모두 0
- STATION 최대는 1
- NAVER 최대는 평일 2, 금/토 3
- STATION 셀 maximum이 0/1이 아니면 irregular로 간주하여 STATION 추천 제외

## 4-5. 대조 검증

- `reconcile_sheet_vs_har`
  - 예약번호 기준으로 플랫폼/가격/박수/체크인/체크아웃 비교
  - `MISSING_IN_HAR`, `MISSING_IN_SHEET` 포함
- `cross_validate_sheet_vs_sources`
  - source 파일(HAR/CSV/JSON/TSV)과 일자 단위 이벤트 교차검증
  - `MISSING_IN_SOURCE`, `MISSING_IN_SHEET`, `CHANNEL_MISMATCH`, `DATE_MISMATCH`

## 4-6. source 데이터 적재(`load_source_reservations`)

입력 소스:

- `--har`, `--wings-file`, `--naver-file`, `--station-file`

형식:

- `.csv`, `.tsv`, `.json`, `.har`, `.txt`, `.log`

특징:

- 다양한 alias 필드명을 정규화해 예약번호/기간/채널 파싱
- (예약번호, checkin, checkout, channel, source_system) 키로 dedupe

## 4-7. 분석 결과 파일

출력 디렉토리(`--out-dir`, 기본 `output`)에 생성:

- `reservation_blocks.csv`
- `vac_daily.csv`
- `vac_by_room_type.csv`
- `channel_recommendations.csv`
- `cross_validation_issues.csv`
- `source_reservations.csv`
- `summary.json`

`summary.json`에는 입력 요약, 블록/이슈 카운트, inventory row 위치, 이슈 상세가 포함된다.

## 5) 동기화 CLI(`reservation_sheet_sync.py`) 상세

## 5-1. 시트 스냅샷 구성(`load_sheet_snapshot`)

포함 필드:

- `spreadsheet_id`, `sheet_name`
- `date_cols` (필터 적용 후)
- `inventory_rows`
- `naver_values`, `station_values`

날짜 필터:

- `--sync-start-date`, `--sync-end-date` 범위만 유지
- 필터 후 날짜 열이 없으면 오류

## 5-2. target units 계산 규칙

### 5-2-1. provider baseline max

- STATION: 1
- NAVER: 4

(`PROVIDER_TARGET_MAX`)

### 5-2-2. 값 해석(`inventory_value_to_target_units`)

- 닫힘 텍스트(`closed`, `soldout`, `off`, `x`, `닫음`, `마감`)면 0
- `current >= maximum`이면 0
- mode=`available`
  - current/max 모두 있으면 `maximum-current`
  - current만 있으면 `current`
  - max만 있으면 `max`
- mode=`current`
  - current 우선, 없으면 max
- 최종 폴백: raw에서 첫 숫자
- 전부 실패 시 `None`

### 5-2-3. target map 생성

- `build_target_map`: 날짜별 target 정수 맵 생성
- provider별 target이 비어 있으면 오류

## 5-3. target 검증(`analyze_target_map`)

검증 코드:

- `UNPARSEABLE_CELL` (error)
- `NEGATIVE_TARGET` (error)
- `CURRENT_EXCEEDS_MAXIMUM` (warn)
- `MAX_DIFFERS_FROM_BASELINE` (warn)
- `TARGET_EXCEEDS_PROVIDER_MAX` (warn)

적용 차단:

- `--apply` 모드에서는 validation error, 승격된 warn, Station 계획 경고가 있으면 적용 중단
- override가 필요하면 `--allow-unsafe-apply` 사용

## 5-4. STATION 액션 계획/적용

계획(`plan_station_actions`):

- 일자별 캘린더 rows를 room id 기준으로 묶음
- `allocate_room_units`로 0/1 할당
- 현재 open/target open을 반영해 실제 stock 변경 필요분만 mismatch로 집계
- payload:
  - `branchId`, `priceSetId`, `applyDates`, `roomSettingStocks`

적용(`apply_station_actions`):

- `hasChange=false`면 `SKIPPED_NO_CHANGE`
- 변경분은 PATCH `/apply/price-set`

## 5-5. NAVER 액션 계획/적용

계획(`plan_naver_actions`):

- room/day별 현재 `stock`, `isSaleDay` 맵 생성
- `allocate_room_units_flexible`로 target units 분배
- 액션 2종 생성:
  - `stock` 변경(`/stock-schedules`)
  - `sale-day` 변경(`/sale-schedules`)

적용(`apply_naver_actions`):

- 액션마다 POST 호출 후 `APPLIED` 결과 저장

## 5-6. HAR 기반 헤더/토큰 보조

- `extract_headers_from_har`:
  - 최신 요청에서 인증 관련 헤더(cookie, csrf 등) 추출
- STATION:
  - `extract_station_token_from_har`로 로그인 응답 `accessToken` 추출 가능
- NAVER:
  - HAR 헤더 + `--naver-cookie`, `--naver-csrf-token`, `--naver-role`로 보강

## 5-7. 동기화 결과 파일

출력:

- `sync_inventory_summary.json`

포함:

- apply 여부, provider, 시트 메타, target 기간/개수
- validation 결과
- provider별 actions/warnings/results

표준 출력에는 적용 모드, provider, date range, action 수, validation error/warn 수가 요약된다.

## 6) CLI 인자 요약

## 6-1. analyze 계열 주요 인자

- `--spreadsheet`, `--sheet-name`, `--gid`, `--start-row`, `--year`
- `--har`, `--wings-file`, `--naver-file`, `--station-file`
- `--vac-share-limit`, `--out-dir`
- `--access-token`, `--token-file`, `--client-id`, `--client-secret`

## 6-2. sync 주요 인자

- 시트/날짜:
  - `--spreadsheet`, `--sheet-name`, `--start-row`, `--year`
  - `--sync-start-date`, `--sync-end-date`
  - `--sheet-stock-mode` (`available`/`current`)
- 적용:
  - `--provider` (`station`/`naver`/`both`)
  - `--apply`
  - `--allow-unsafe-apply`
- provider/API:
  - STATION: base url, branch id, room ids, token/har
  - NAVER: base url, business id, room ids, har/cookie/csrf/role/desc

## 7) 종료 코드

- 정상 완료: `0`
- 도메인 오류(`AuditError`): `2`
- HTTP 예외(`requests.RequestException`): `3`

## 8) 운영 체크포인트

- `--sheet-stock-mode`를 잘못 선택하면 target 방향(가용/현재)이 바뀌므로 적용 결과가 달라진다.
- dry-run(기본)으로 `sync_inventory_summary.json` 검토 후 `--apply` 실행이 안전하다.
- 분석 리포트(`summary.json`, `cross_validation_issues.csv`)로 시트/소스 불일치 원인을 먼저 정리하면 동기화 실패를 줄일 수 있다.


