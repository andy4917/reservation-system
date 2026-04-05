export const DEFAULT_APP_BGE_MODEL_ID = "Xenova/bge-m3";

export const APP_BRANCH_OPTION_RECORDS = [
  { branch: "COEX", label: "코엑스", availability: "active", reason: "운영 지점" },
  { branch: "GANGNAM", label: "강남", availability: "active", reason: "운영 지점" },
  { branch: "SEOLLEUNG", label: "선릉", availability: "active", reason: "운영 지점" },
  { branch: "SAMSUNG", label: "삼성", availability: "inactive", reason: "preopen inactive branch" },
] as const;

export const APP_PROVIDER_OPTION_RECORDS = [
  {
    provider: "wings-pms",
    label: "윙스",
    shortLabel: "WINGS",
    partition: "persist:app-v2-wings",
    startUrl: "https://pms.sanhait.com/",
    sessionOrigin: "https://pms.sanhait.com",
    apiOrigin: "https://pms.sanhait.com",
    cookieScopeUrls: ["https://pms.sanhait.com/"],
    allowedHostSuffixes: ["sanhait.com"],
    readyHosts: ["pms.sanhait.com"],
    loginUrlHints: ["identity/samlsso", "sso", "redirect"],
  },
  {
    provider: "naver-partner",
    label: "네이버 파트너",
    shortLabel: "OTA",
    partition: "persist:app-v2-naver",
    startUrl: "https://partner.booking.naver.com/",
    sessionOrigin: "https://partner.booking.naver.com",
    apiOrigin: "https://api-partner.booking.naver.com",
    cookieScopeUrls: ["https://partner.booking.naver.com/", "https://new.smartplace.naver.com/"],
    allowedHostSuffixes: ["naver.com"],
    readyHosts: ["partner.booking.naver.com", "new.smartplace.naver.com"],
    loginUrlHints: [],
  },
  {
    provider: "admin-station",
    label: "스테이션",
    shortLabel: "STATION",
    partition: "persist:app-v2-station",
    startUrl: "https://admin.admin-stationbyuhc.com/",
    sessionOrigin: "https://admin.admin-stationbyuhc.com",
    apiOrigin: "https://api.admin-stationbyuhc.com",
    cookieScopeUrls: ["https://admin.admin-stationbyuhc.com/"],
    allowedHostSuffixes: ["admin-stationbyuhc.com"],
    readyHosts: ["admin.admin-stationbyuhc.com"],
    loginUrlHints: [],
  },
] as const;
