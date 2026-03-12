# Wings HAR Refresh Audit

## Scope

- Baseline HAR: official `2026-03-12` COEX and GANGNAM Wings PMS captures
- Goal: refresh latest HAR-linked code, find stale documentation, and identify remaining legacy compatibility layers

## Verified Updates

- Default reservation-list preset path is now `/pms/biz/ir04_0200X_V03/searchListRsvn.do`
- Both `COEX` and `GANGNAM` branch Wings profiles in [`branch_provider_mapping_v1.json`](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/truth_dataset/branch_provider_mapping_v1.json) are marked `verified-by-har`
- Reservation fetch results now preserve `sourceCode`, `nationalityCode`, `languageCode`, `languageName`, and `endpointCapability`
- Sanitized endpoint catalog and capability matrix were regenerated from the latest HAR pair

## Legacy Compatibility

- `/pms/biz/ir04_0100X/searchListRsvn.do`
  - status: retained
  - reason: older HAR parsing compatibility only
  - runtime default: no
  - location: [`normalize.js`](/mnt/c/Users/anise/OneDrive/바탕%20화면/예약%20통합%20관리%20시스템/src/scan/normalize.js)

## Stale Or Removed Assumptions

- Removed from current integration document because not observed in latest HAR:
  - `searchFITInHouse.do`
  - `searchListInterMemo.do`
  - `searchListRateByWalkIn.do`
  - `searchListServiceByWalkIn.do`
  - `selectAllMenuList.do`
  - `selectUserInfo.do`

These are not automatically dead product code. They are only no longer treated as current official integration evidence.

## No Dead Runtime Findings

- No active fetch path still defaults to the stale reservation-list URL
- No mutation endpoint is wired into the read-only PMS fetch path
- No latest-HAR-linked code path was found to be unreachable under the current adapter/fetch flow

## Recommendations

- Promote these capabilities into explicit phase-2 live contracts first:
  - `reservation_lookup`
  - `reservation_detail`
  - `source_catalog`
  - `nationality_language_lookup`
  - `assigned_room_lookup`
- Keep `reservation_lookup_local` branch-scoped instead of pretending it is globally available
- Classify the remaining `readonly_unknown` endpoints before allowing them into app-visible registry surfaces
