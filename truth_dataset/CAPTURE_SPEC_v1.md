# Capture Spec V1

## Goal

실제 sampled live capture를 truth dataset bundle로 적재할 때 필요한 입력 조각과 redaction 규칙을 고정한다.

## Required Inputs

1. `manifest.json`
2. `sheet_rows.json`
3. `wings_reservations.json`
4. `ota_inventory_rows.json`
5. `ota_reservations.json`
6. `bridge_events.json`

## File Rules

- 각 파일은 UTF-8 JSON이어야 한다.
- manifest는 object, 나머지는 array여야 한다.
- 실제 운영 샘플도 raw payload 전체를 넣지 않는다.
- guest name은 partial mask, phone은 tail-only, token/cookie는 fingerprint-only 규칙을 지킨다.

## Branch Mapping

branch/provider 계정 기준은 `branch_provider_mapping_v1.json`을 따른다.

- Wings: `PROPERTY_NO`, `BSNS_CODE`, `preset_key`
- Naver: `business_id`
- Station: `branch_id`

## Suggested Folder Layout

```text
truth_dataset/captures/<bundle_id>/
  manifest.json
  sheet_rows.json
  wings_reservations.json
  ota_inventory_rows.json
  ota_reservations.json
  bridge_events.json
  capture_spec.json
```

## Build Command

```bash
python3 scripts/build_truth_capture_bundle.py \
  --spec truth_dataset/local/capture_spec.json \
  --output truth_dataset/local/truth_bundle.json
```

## Minimum Sampling Policy

- branch별 최소 1 bundle
- Wings branch profile별 최소 1 reservation sample
- OTA provider별 최소 1 inventory sample
- bridge provider별 최소 1 event sample
- 같은 bundle 안에 branch/provider/channel evidence가 모두 포함되도록 구성
