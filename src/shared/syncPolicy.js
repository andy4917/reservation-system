(() => {
  "use strict";

  const root = globalThis;
  const ns = (root.InventorySyncPolicy = root.InventorySyncPolicy || {});
  if (ns.__ready) return;

  const POLICY_JSON = `{
    "defaultNaverBusinessId": "1356779",
    "defaultStationBranchId": "18",
    "defaultNaverRoomIds": ["6556948", "6556938", "7043386"],
    "defaultStationRoomIds": ["62", "59", "258"],
    "defaultStationApiBase": "https://api.admin-stationbyuhc.com",
    "defaultNaverApiBase": "https://api-partner.booking.naver.com",
    "providerTargetMax": {
      "NAVER": 4,
      "STATION": 1
    },
    "applyBlockingValidationWarnCodes": [
      "CURRENT_EXCEEDS_MAXIMUM",
      "MAX_DIFFERS_FROM_BASELINE",
      "TARGET_EXCEEDS_PROVIDER_MAX"
    ],
    "applyBlockingStationWarningCodes": [
      "STATION_NO_CALENDAR_ROWS",
      "STATION_NO_PRICE_SET_ID"
    ]
  }`;

  const data = Object.freeze(JSON.parse(POLICY_JSON));

  Object.assign(ns, data, {
    __ready: true,
    POLICY_JSON
  });
})();
