# Wings PMS Integration

## Current Baseline

- Source of truth for this document: official `2026-03-12` COEX/GANGNAM HAR captures plus the `2026-03-31` SEOLLEUNG sample HAR.
- Wings PMS is operating as a shared multi-property surface keyed by `PROPERTY_NO` and `BSNS_CODE`.
- Reservation read flow is `POST + application/x-www-form-urlencoded` rather than simple `GET`.
- The system must remain read-only. `update`, `insert`, `delete`, `send` endpoints are explicitly blocked.

## Observed Endpoints

- Total business `.do` endpoints in the latest HAR pair: `38`
- Read-only endpoints: `34`
- Mutation endpoints: `4`

Current read paths directly tied to this project:

- Reservation lookup: `/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do`
- Reservation summary: `/pms/biz/ir04_0100X/searchListGlobalRsvn_v03_SUM.do`
- Local reservation lookup: `/pms/biz/ir04_0200X_V03/searchListRsvn.do`
- Reservation detail: `/pms/biz/ir01_0102/searchFITReserv.do`
- Linked reservation lookup: `/pms/biz/fd01_0101/searchListLinkedReservation.do`
- Room block chart: `/pms/biz/ir01_0300/searchListRoomBlockChart_V03.do`
- Room availability: `/pms/biz/ir01_0300/searchListRoomAvaiable.do`
- Source catalog: `/pms/biz/ir04/searchListSource.do`
- Nationality to language lookup: `/pms/biz/comn/searchLangByNatCode.do`
- Gangnam assigned-room lookup: `/pms/biz/ir01_0124/searchGuestInfo.do`, `/pms/biz/ir01_0124/searchListAssignedRoom.do`, `/pms/biz/ir01_0124/searchListRoom.do`, `/pms/biz/ir01_0124/searchListRoomTypeByParam.do`

## Presets

- `wings-global-guest-list`
  - default path: `/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do`
  - current branches: `COEX`, `GANGNAM`, `BRANCH_THE_SEOLLEUNG`
- `wings-reservation-list`
  - default path: `/pms/biz/ir04_0200X_V03/searchListRsvn.do`
  - current observed branch: `COEX`
  - legacy HAR alias retained: `/pms/biz/ir04_0100X/searchListRsvn.do`

The legacy reservation-list path is kept only so older HAR bundles still parse. It is not the default execution path anymore.

## Read-Only Contract

- Allow only `/pms/biz/.../(search|select|view)*.do`
- Reject all `/pms/biz/.../(update|insert|delete|send)*.do`
- Clamp query range to `31` days
- Preserve request method, `contentType`, and `requestBody`
- Capability requests now reuse the HAR-derived form body as a base and override only the fields needed per endpoint, so hidden branch-specific fields are less likely to be dropped.
- Preserve only minimal verification fields from reservation rows:
  - `reservationNo`, `reservationRef`, `checkin`, `checkout`, `nights`
  - `account`, `sourceCode`, `branch`, `status`, `statusBucket`
  - `guestName`, `phoneTail`, `remarkHead`
  - `nationalityCode`, `languageCode`, `languageName`

## Session Strategy

- HAR remains a structure source, not the long-term auth source.
- If the official browser session is live, runtime uses the browser-assisted auth path and does not enter managed recovery mode.
- The default session owner is the app-managed persistent BrowserWindow partition for `wings-pms`, not an external browser handoff.
- Interactive app startup primes the hidden `wings-pms` BrowserWindow so the session partition is available before the operator asks for a live read.
- `.env` is not an allowed replacement for Wings PMS login because the live read path depends on the browser session owned by Electron main.
- Managed recovery runs only when the browser session is offline or unavailable.
- UI surfaces keep this silent and expose only generic live availability, not recovery logs or session state strings.

## Mutation Endpoints Seen In HAR

- `/pms/biz/ir01_0124/insertAssignedRoom.do`
- `/pms/biz/ir01_0124/deleteAssignedRoom.do`
- `/pms/biz/ir01_0300_V03/updateReservationProcessExpress.do`
- `/pms/biz/comn/sendBookingEngineAPI.do`

These are evidence that operator actions happened in the recorded sessions. They are useful for capability mapping, but they must not be wired into runtime apply paths.

## Legacy And Stale Findings

- Stale documentation previously listed `searchFITInHouse.do`, `searchListInterMemo.do`, `searchListRateByWalkIn.do`, `searchListServiceByWalkIn.do`, `selectAllMenuList.do`, `selectUserInfo.do` as active assumptions.
- Those endpoints were not observed in the latest official HAR pair, so they are no longer documented as current integration targets.
- No dead runtime execution path was found for the old reservation-list URL. It remains only as backward-compatible HAR parsing alias in `src/scan/normalize.js`.

## Next Phase Inputs

- Sanitized endpoint inventory: `truth_dataset/reports/wings_har_endpoint_catalog.json`
- Human-readable catalog: `truth_dataset/reports/wings_har_endpoint_catalog.md`
- Capability matrix: `truth_dataset/wings_capability_matrix_v1.json`

Recommended next step:

- Promote `reservation_lookup`, `reservation_detail`, `source_catalog`, `nationality_language_lookup`, and `assigned_room_lookup` into explicit channel-aware live contracts for phase 2.

## Implemented Live Contracts

The phase-2 entrypoint is now:

- `App.io.pmsFetch.fetchWingsLiveContract(providerType, request, syncConfig)`

Implemented capabilities:

- `reservation_summary`
- `reservation_lookup`
- `reservation_lookup_local`
- `reservation_detail`
- `linked_reservation_lookup`
- `room_block_chart`
- `room_availability_chart`
- `room_availability_summary`
- `source_catalog`
- `room_type_catalog`
- `market_catalog`
- `rate_catalog`
- `sale_person_catalog`
- `nationality_language_lookup`
- `account_contract_lookup`
- `special_service_lookup`
- `reservation_rate_lookup`
- `assigned_room_guest_info`
- `assigned_room_lookup`
- `assignable_room_lookup`
- `assignable_room_type_lookup`

Structured request/response summary is captured in `truth_dataset/wings_live_contract_v2.json`.
