# Truth Dataset

이 폴더는 실제 시트 + OTA + Wings 읽기 데이터를 truth set 기준으로 정렬하기 위한 1차 산출물 저장소다.

## Included

- `canonical_data_contract_v1.schema.json`
- `branch_provider_mapping_v1.json`
- `provider_channel_taxonomy_v1.json`
- `room_alias_graph_v1.json`
- `reservation_identity_graph_v1.json`
- `wings_capability_matrix_v1.json`
- `wings_live_contract_v2.json`
- `CAPTURE_SPEC_v1.md`
- `reports/current_contract_gap_report.md`
- `reports/wings_har_endpoint_catalog.md`
- `reports/wings_har_refresh_audit.md`

## Principles

- raw field와 canonical field를 함께 보존한다.
- 이름, 전화, 쿠키, 토큰은 redaction 또는 hash된 값만 둔다.
- 실제 운영 샘플은 같은 schema를 사용하되 별도 비공개 저장소나 로컬 artifact에 둔다.
- 이 저장소는 예시 fixture를 내장하지 않는다. 검증용 bundle/spec는 호출 시 명시적으로 넘긴다.

## Validation

```bash
python3 scripts/validate_truth_dataset.py --bundle truth_dataset/local/truth_bundle.json
python3 scripts/build_truth_capture_bundle.py --spec truth_dataset/local/capture_spec.json --output truth_dataset/local/truth_bundle.json
python3 scripts/analyze_wings_har_endpoints.py truth_dataset/local/coex.har truth_dataset/local/gangnam.har --json-out truth_dataset/reports/wings_har_endpoint_catalog.json --md-out truth_dataset/reports/wings_har_endpoint_catalog.md
python3 scripts/build_wings_capability_matrix.py
```

validator는 다음을 점검한다.

- 필수 entity/field 존재 여부
- branch/provider/channel canonical coverage
- room alias unresolved rate
- reservation identity collision rate
- branch별 누락 필드 비율

Wings 최신 HAR 분석 산출물은 phase-2 계약 입력으로 사용한다.

- endpoint inventory: `reports/wings_har_endpoint_catalog.json`
- capability matrix: `wings_capability_matrix_v1.json`
- live contract: `wings_live_contract_v2.json`
- stale/legacy audit: `reports/wings_har_refresh_audit.md`
