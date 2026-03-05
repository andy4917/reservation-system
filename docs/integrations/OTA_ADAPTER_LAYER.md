# OTA Adapter Layer 가이드

## 목적

OTA API 스펙을 엔진 계층에서 분리해, API 변경/추가 시 영향 범위를 `Adapter` 내부로 한정한다.

## 권장 구조

```text
Data Sources
 ├ OTA APIs
 ├ PMS
 └ Email
     ↓
OTA Adapter Layer
     ↓
Reservation Database
     ↓
Inventory Engine
     ↓
Validation Engine
     ↓
Sync Planner
     ↓
Channel Executors
 ├ Station
 └ Naver
```

## Adapter 책임

- `fetch_reservations`
- `fetch_changes`
- `cancelled_reservations`
- `get_inventory`

Adapter는 OTA 원본 응답을 내부 표준 모델로 정규화한다.

## 내부 표준 모델

### Reservation

- `reservation_id`
- `provider`
- `room_type`
- `checkin`
- `checkout`
- `nights`
- `status`

### Inventory

- `provider_item_id`
- `date`
- `stock`

## 예외 규칙: Station

- OTA: 읽기 중심 소스 데이터
- Station: 쓰기 중심 채널 실행기

따라서 `Inventory Engine`, `Validation Engine`, `Sync Planner`는 OTA API를 직접 호출하지 않고, 항상 Adapter 또는 Executor 레이어를 통해야 한다.

## 현재 운영 소스 모드

- `NAVER`: OTA API 직접 조회(읽기)
- `STATION`: Channel Executor 직접 반영(쓰기)
- `BOOKING`, `AGODA`, `TRIP`, `AIRBNB`: `WINGS HAR` 기반 정규화 조회(읽기)
