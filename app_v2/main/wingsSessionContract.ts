import type { AppBranch } from "../../src/desktop/app-v2-contracts.js";
import { getAppProviderOption } from "../../src/desktop/app-v2-contracts.js";

interface WingsSessionContractInput {
  branch: AppBranch;
  label: string;
  startDate: string;
  endDate: string;
  endpointPath: string;
  presetKey: string;
  propertyNo: string;
  bsnsCode: string;
}

interface SerializedRequestContract {
  branch: AppBranch;
  label: string;
  propertyNo: string;
  bsnsCode: string;
  request: {
    urlPath: string;
    method: "POST";
    headers: Record<string, string>;
    body: string;
  };
}

interface WingsExpenditureRows {
  roomNo: string;
  guestName: string;
  nationality: string;
  checkin: string;
  checkout: string;
}

const PRESET_PAGE_IDS: Record<string, string> = {
  "wings-global-guest-list": "IR04_0100X_V03",
  "wings-reservation-list": "IR04_0200X_V03",
};

const ALLOWED_READONLY_PATHS = new Set([
  "/pms/biz/ir04_0100X/searchListGlobalRsvn_v03.do",
  "/pms/biz/ir04_0200X_V03/searchListRsvn.do",
]);

function normalizeText(value: string | undefined | null) {
  return typeof value === "string" ? value.trim() : "";
}

function buildReadonlyBody(input: WingsSessionContractInput) {
  const pageId = PRESET_PAGE_IDS[input.presetKey] || PRESET_PAGE_IDS["wings-reservation-list"];
  const body = new URLSearchParams();
  body.set("take", "300");
  body.set("skip", "0");
  body.set("page", "1");
  body.set("pageSize", "300");
  body.set("filter[PAGE_ID]", pageId);
  body.set("filter[AUTH_PASS_YN]", "N");
  body.set("filter[filters][0][field]", "BSNS_CODE");
  body.set("filter[filters][0][value]", input.bsnsCode);
  body.set("filter[filters][1][field]", "PROPERTY_NO");
  body.set("filter[filters][1][value]", input.propertyNo);
  body.set("filter[filters][2][field]", "ARRV_DATE");
  body.set("filter[filters][2][operator]", "lte");
  body.set("filter[filters][2][value]", input.endDate);
  body.set("filter[filters][3][field]", "DEPT_DATE");
  body.set("filter[filters][3][operator]", "gte");
  body.set("filter[filters][3][value]", input.startDate);
  body.set("ARRV_DATE_F", input.startDate);
  body.set("ARRV_DATE_T", input.endDate);
  body.set("DEPT_DATE_F", input.startDate);
  body.set("DEPT_DATE_T", input.endDate);
  body.set("STAY_DATE_F", input.startDate);
  body.set("STAY_DATE_T", input.endDate);
  return body.toString();
}

export function buildWingsReadonlyRequestContract(input: WingsSessionContractInput): SerializedRequestContract {
  const endpointPath = normalizeText(input.endpointPath);
  const propertyNo = normalizeText(input.propertyNo);
  const bsnsCode = normalizeText(input.bsnsCode) || propertyNo;
  if (!propertyNo || !bsnsCode) {
    throw new Error("Wings branch context is missing");
  }
  if (!ALLOWED_READONLY_PATHS.has(endpointPath)) {
    throw new Error(`Unsupported Wings readonly endpoint: ${endpointPath || "-"}`);
  }
  return {
    branch: input.branch,
    label: input.label,
    propertyNo,
    bsnsCode,
    request: {
      urlPath: endpointPath,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: buildReadonlyBody({
        ...input,
        endpointPath,
        propertyNo,
        bsnsCode,
      }),
    },
  };
}

export function buildWingsSessionReadScript(input: WingsSessionContractInput) {
  const contract = buildWingsReadonlyRequestContract(input);
  const wingsOrigin = getAppProviderOption("wings-pms").sessionOrigin;
  return `
    (async () => {
      const ctx = ${JSON.stringify(contract)};
      const normalize = (value) => typeof value === "string" ? value.trim() : "";
      const origin = location.origin || ${JSON.stringify(wingsOrigin)};
      const url = new URL(ctx.request.urlPath, origin);
      const response = await fetch(url.toString(), {
        method: ctx.request.method,
        credentials: "include",
        headers: ctx.request.headers,
        body: ctx.request.body
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error("PMS API (" + response.status + "): " + text.slice(0, 160));
      }
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed && parsed.rows) ? parsed.rows : Array.isArray(parsed && parsed.data && parsed.data.rows) ? parsed.data.rows : [];
      const items = rows.slice(0, 4).map((row, index) => ({
        id: "pms:" + index,
        title: [normalize(row.ROOM_NO || row.roomNo || ""), normalize(row.GUEST_NAME || row.guestName || "")].filter(Boolean).join(" / ") || ("PMS " + (index + 1)),
        subtitle: [normalize(row.ARRV_DATE || row.arrvDate || ""), normalize(row.DEPT_DATE || row.deptDate || ""), normalize(row.RSVN_NO || row.reservationNo || "")].filter(Boolean).join(" · ") || "reservation",
        statusLabel: normalize(row.RSVN_STATUS_CODE || row.status || "LIVE") || "LIVE",
      }));
      return {
        checkedAt: new Date().toISOString(),
        recordsImported: rows.length,
        summary: ctx.label + " PMS 라이브 데이터를 읽었습니다.",
        items,
        evidence: [
          "provider:wings-pms",
          "branch:" + ctx.branch,
          "runtimeHost:" + (location.host || "-"),
          "sessionReadiness:browser-session",
          "sourceLineage:" + url.pathname,
          "pmsPropertyNo:" + ctx.propertyNo,
          "pmsBsnsCode:" + ctx.bsnsCode,
        ]
      };
    })()
  `;
}

export function buildWingsExpenditureReadScript(input: WingsSessionContractInput) {
  const contract = buildWingsReadonlyRequestContract(input);
  const wingsOrigin = getAppProviderOption("wings-pms").sessionOrigin;
  return `
    (async () => {
      const ctx = ${JSON.stringify(contract)};
      const normalize = (value) => typeof value === "string" ? value.trim() : "";
      const origin = location.origin || ${JSON.stringify(wingsOrigin)};
      const url = new URL(ctx.request.urlPath, origin);
      const response = await fetch(url.toString(), {
        method: ctx.request.method,
        credentials: "include",
        headers: ctx.request.headers,
        body: ctx.request.body
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error("PMS API (" + response.status + "): " + text.slice(0, 160));
      }
        const parsed = JSON.parse(text);
        const rows = Array.isArray(parsed && parsed.rows)
          ? parsed.rows
          : Array.isArray(parsed && parsed.data && parsed.data.rows)
            ? parsed.data.rows
            : [];
        return {
          checkedAt: new Date().toISOString(),
          recordsImported: rows.length,
          rows: rows.map((row) => ({
          roomNo: normalize(row.ROOM_NO || ""),
          guestName: normalize(row.GUEST_NAME || row.INHS_GEST_NAME || ""),
          nationality: normalize(row.NAT_NM || row.NAT_NAME || ""),
          checkin: normalize(row.ARRV_DATE || ""),
          checkout: normalize(row.DEPT_DATE || ""),
        })).filter((row) => row.roomNo && row.checkin && row.checkout),
        evidence: [
          "provider:wings-pms",
          "branch:" + ctx.branch,
          "runtimeHost:" + (location.host || "-"),
          "sessionReadiness:browser-session",
          "sourceLineage:" + url.pathname,
          "pmsPropertyNo:" + ctx.propertyNo,
          "pmsBsnsCode:" + ctx.bsnsCode,
        ]
      };
    })()
  `;
}
