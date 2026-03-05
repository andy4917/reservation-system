# Inventory Planner 설계

## 1) Source Graph

- Source 노드
  - `OTA`: authoritative source
  - `PMS`: verification source
  - `Sheet`: UI/ops source
- 흐름
  - `OTA -> InventoryPlanner`
  - `PMS -> ValidationEngine`
  - `Sheet -> InventoryPlanner`
  - `InventoryPlanner -> SyncPlanner -> ChannelExecutors`

## 2) Inventory Authority

- `OTA authoritative`
- `PMS verification`
- `Sheet UI`

## 3) Sync Safety Layer

- 단계
  - `diff`
  - `validate`
  - `approve`
  - `apply`
- 실제 apply는 `approve token`이 일치할 때만 허용
- `approve token` 스코프
  - provider drift
  - validation/policy 상태
  - 실제 apply action payload snapshot (station/naver)

CLI 예시:

```bash
# 1) dry-run
python3 reservation_sheet_sync.py --provider both

# 2) summary의 planner approval token 확인 후 apply
python3 reservation_sheet_sync.py --provider both --apply --approve-plan-token <token>
```
