# 앱 구현 로드맵

## Phase 1

- 앱/확장 책임 경계 문서화
- 브리지 계약 타입 정의

## Phase 2

- Electron 앱 골격 추가
- Codex형 워크스페이스를 예약관리 도메인으로 재구성
- mock 상태 기반 dry-run 셸 구현

## Phase 3

- 앱 저장소/보안 저장소 구현
- inventory compare 앱 이식

## Phase 4

- reservation audit 앱 이식
- apply review 앱 이식

## Phase 5

- extension bridge 구현
- live read 연결

## Phase 6

- live apply 연결
- 확장 UI 축소
- 앱 기준 E2E 검증

## Phase 7

- 앱이 대체한 확장 기능 제거
- dead listener, unused panel flow, obsolete setting path 정리
- 문서와 산출물 경로를 앱 중심 기준으로 재정렬

## 각 단계 완료 기준

- 구현 결과가 dry-run 또는 live smoke로 검증되어야 한다.
- 확장 빌드 경로는 전환 중에도 유지되어야 한다.
- 앱 화면만으로 현재 작업 상태를 이해할 수 있어야 한다.
- 제거 단계에서는 "대체 구현 존재 + 검증 완료 + 호출 경로 제거 확인"이 모두 필요하다.
