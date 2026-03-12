// @ts-check

(() => {
  "use strict";

  /** @typedef {import("../contracts/extension-contracts").InventorySyncPolicyGlobal} InventorySyncPolicyGlobal */
  /** @typedef {import("../contracts/extension-contracts").SyncPolicySchema} SyncPolicySchema */

  const root = globalThis;
  /** @type {InventorySyncPolicyGlobal} */
  const ns = (root.InventorySyncPolicy = root.InventorySyncPolicy || {});
  if (ns.__ready) return;

  const POLICY_JSON = `{
    "sheetDefaults": {
      "spreadsheetId": "1q7mC5p0DKIFboiiOS_aQHoQLzdtszFb76-ntEvOvMj8",
      "sheetName": "2026",
      "sheetGid": 1459449957,
      "startRow": 61,
      "year": 2026,
      "googleClientId": "197214578423-9b9647iri321d86g9bvhpdm8sp73qf3b.apps.googleusercontent.com",
      "googleScope": "https://www.googleapis.com/auth/spreadsheets.readonly",
      "redirectUri": "http://127.0.0.1:8080",
      "tokenFile": ".google_oauth_token.json",
      "pkceFile": ".google_oauth_pkce.json"
    },
    "defaultNaverBusinessId": "1356779",
    "defaultStationBranchId": "18",
    "defaultNaverRoomIds": ["6556948", "6556938", "7043386"],
    "defaultStationRoomIds": ["62", "59", "258"],
    "defaultStationApiBase": "https://api.admin-stationbyuhc.com",
    "defaultNaverApiBase": "https://api-partner.booking.naver.com",
    "bridge": {
      "host": "127.0.0.1",
      "port": 45123,
      "updatePath": "/bridge/update",
      "statePath": "/bridge/state",
      "secret": "",
      "timeoutMs": 3000
    },
    "noteChannelPrefix": {
      "enabled": true,
      "template": "[CHANNEL: {channel}]"
    },
    "roomPresets": {
      "naver-partner": [
        { "id": "6556948", "name": "Urban Spa Suite 6인" },
        { "id": "6556938", "name": "Double Twin Spa Room 4인" },
        { "id": "7043386", "name": "Grand Spa Suite 8인" }
      ],
      "admin-station": [
        { "id": "62", "name": "Urban Spa Suite 6인" },
        { "id": "59", "name": "Double Twin Spa Room 4인" },
        { "id": "258", "name": "Grand Spa Suite 8인" }
      ]
    },
    "roomTypeByRoomNo": {
      "201": "Urban Spa Suite 6인",
      "301": "Urban Spa Suite 6인",
      "401": "Urban Spa Suite 6인",
      "501": "Urban Spa Suite 6인",
      "601": "Urban Spa Suite 6인",
      "701": "Urban Spa Suite 6인",
      "801": "Urban Spa Suite 6인",
      "901": "Urban Spa Suite 6인",
      "1001": "Urban Spa Suite 6인",
      "1101": "Urban Spa Suite 6인",
      "1201": "Urban Spa Suite 6인",
      "A301": "Urban Spa Suite 6인",
      "A401": "Urban Spa Suite 6인",
      "A501": "Urban Spa Suite 6인",
      "A601": "Urban Spa Suite 6인",
      "A701": "Urban Spa Suite 6인",
      "A801": "Urban Spa Suite 6인",
      "A901": "Urban Spa Suite 6인",
      "A1001": "Urban Spa Suite 6인",
      "A1101": "Urban Spa Suite 6인",
      "202": "Double Twin Spa Room 4인",
      "302": "Double Twin Spa Room 4인",
      "402": "Double Twin Spa Room 4인",
      "502": "Double Twin Spa Room 4인",
      "602": "Double Twin Spa Room 4인",
      "702": "Double Twin Spa Room 4인",
      "802": "Double Twin Spa Room 4인",
      "902": "Double Twin Spa Room 4인",
      "1002": "Double Twin Spa Room 4인",
      "1102": "Double Twin Spa Room 4인",
      "1202": "Double Twin Spa Room 4인",
      "A302": "Double Twin Spa Room 4인",
      "A402": "Double Twin Spa Room 4인",
      "A502": "Double Twin Spa Room 4인",
      "A602": "Double Twin Spa Room 4인",
      "A702": "Double Twin Spa Room 4인",
      "A802": "Double Twin Spa Room 4인",
      "A902": "Double Twin Spa Room 4인",
      "A1002": "Double Twin Spa Room 4인",
      "A1102": "Double Twin Spa Room 4인",
      "A1201": "Grand Spa Suite 8인"
    },
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

  /** @type {SyncPolicySchema} */
  const parsedPolicy = JSON.parse(POLICY_JSON);
  const data = Object.freeze(parsedPolicy);

  Object.assign(ns, data, {
    __ready: true,
    POLICY_JSON
  });
})();
