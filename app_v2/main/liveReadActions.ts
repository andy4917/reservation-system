import { spawn } from "node:child_process";
import path from "node:path";
import type {
  AppBranch,
  AppLiveReadInput,
  AppLiveReadPreviewItem,
  AppLiveReadSnapshot,
  AppProvider,
} from "../../src/desktop/app-v2-contracts.js";
import { DEFAULT_APP_REPORT_WINDOW_DAYS, getAppBranchOption, getAppProviderOption } from "../../src/desktop/app-v2-contracts.js";
import { describeEmbeddingAvailability } from "./embeddingRuntime.js";
import { getBranchRuntimeProfile, getProviderBinding } from "./branchRuntimeConfig.js";
import { buildHybridCandidateDecisions, buildHybridCandidatePairs, type HybridSearchBundle } from "./hybridCandidateEngine.js";
import { executeProviderReadScript, getProviderBrowserState } from "./providerWorkspaceManager.js";
import { loadSettingsSnapshot } from "./settingsStore.js";
import { buildWingsSessionReadScript } from "./wingsSessionContract.js";

const PYTHON_COMMAND = process.env.PYTHON_BIN || "python3";

interface LiveSheetBridgePayload {
  branch: AppBranch;
  checkedAt: string;
  recordsImported: number;
  summary: string;
  items: AppLiveReadPreviewItem[];
  reviewCandidates?: SheetReviewCandidate[];
  searchBundles?: HybridSearchBundle[];
  candidateFeatures?: string[];
  contradictionFlags?: string[];
  evidence: string[];
  error?: string;
}

interface SheetReviewCandidate {
  id: string;
  roomNo: string;
  date: string;
  basis: string;
  leftText: string;
  rightText: string;
  leftSummary: string;
  rightSummary: string;
}

interface ProviderSessionReadPayload {
  checkedAt: string;
  recordsImported: number;
  summary: string;
  items: AppLiveReadPreviewItem[];
  copyText?: string;
  evidence: string[];
  error?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function buildError(
  source: AppLiveReadSnapshot["source"],
  branch: AppBranch,
  blockedReason: string,
  evidence: string[],
): AppLiveReadSnapshot {
  return {
    source,
    branch,
    checkedAt: nowIso(),
    status: "error",
    summary: blockedReason,
    recordsImported: 0,
    blockedReason,
    items: [],
    copyText: null,
    evidence,
  };
}

function buildBranchBlockedRead(source: AppLiveReadSnapshot["source"], branch: AppBranch): AppLiveReadSnapshot | null {
  const profile = getBranchRuntimeProfile(branch);
  if (profile.gate.readAllowed) return null;
  return buildError(source, branch, `${profile.label} 지점은 아직 운영 경로가 열리지 않았습니다.`, [
    `branch:${branch}`,
    `branchAvailability:${profile.availability}`,
    `branchReason:${profile.reason}`,
  ]);
}

async function ensureProviderReadable(provider: AppProvider, summaryLabel: string) {
  const providerState = await getProviderBrowserState(provider);
  if (providerState.pageState !== "loaded") {
    return {
      ok: false as const,
      reason: `${summaryLabel} 세션이 아직 준비되지 않았습니다.`,
      evidence: [
        `pageState:${providerState.pageState}`,
        `runtimeHost:${providerState.currentHost ?? "-"}`,
        `providerCookies:${providerState.providerCookieCount}`,
      ],
    };
  }
  return {
    ok: true as const,
    evidence: [
      `pageState:${providerState.pageState}`,
      `runtimeHost:${providerState.currentHost ?? "-"}`,
      `providerCookies:${providerState.providerCookieCount}`,
      "sessionReadiness:browser-session",
    ],
  };
}

function runPythonJson(args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(PYTHON_COMMAND, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `python exited with ${code}`));
    });
  });
}

function resolveSheetNames(settings: Awaited<ReturnType<typeof loadSettingsSnapshot>>) {
  return settings.config?.sheetName ? [settings.config.sheetName] : [];
}

async function buildSettingsEvidence() {
  const settings = await loadSettingsSnapshot();
  return [
    `spreadsheet:${settings.config?.spreadsheet ? "set" : "missing"}`,
    `sheetName:${settings.config?.sheetName ? "set" : "missing"}`,
    `windowDays:${settings.config?.reportWindowDays ?? DEFAULT_APP_REPORT_WINDOW_DAYS}`,
    `bgeM3:${settings.config?.bgeM3?.enabled ? "on" : "off"}`,
    `bgeModelPath:${settings.config?.bgeM3?.modelPath ? "set" : "missing"}`,
    `bgeRuntime:${settings.config?.bgeM3?.runtime ?? "local-path"}`,
  ];
}

async function runLiveSheetBridge(input: AppLiveReadInput): Promise<LiveSheetBridgePayload> {
  const settings = await loadSettingsSnapshot();
  const spreadsheet = settings.config?.spreadsheet?.trim() ?? "";
  const sheetNames = resolveSheetNames(settings);
  if (!spreadsheet || sheetNames.length === 0) {
    throw new Error("예약 시트 설정이 비어 있습니다.");
  }
  const cwd = process.cwd();
  const scriptPath = path.join(cwd, "scripts", "app_v2_live_sheet_bridge.py");
  const args = [
    scriptPath,
    "sheet-read",
    "--spreadsheet",
    spreadsheet,
    "--branch",
    getBranchRuntimeProfile(input.branch).canonicalBranch,
    "--start-date",
    input.startDate,
    "--end-date",
    input.endDate,
  ];
  for (const sheetName of sheetNames) {
    args.push("--sheet-name", sheetName);
  }
  const stdout = await runPythonJson(args, cwd);
  const payload = JSON.parse(stdout) as LiveSheetBridgePayload;
  if (payload.error) throw new Error(payload.error);
  return payload;
}

function formatAiStatus(score: number | undefined) {
  if (typeof score !== "number") return "검토";
  if (score >= 0.9) return "AI추천";
  if (score >= 0.82) return "AI검토";
  return "검토";
}

async function scoreSheetReviewCandidates(payload: LiveSheetBridgePayload) {
  const settings = await loadSettingsSnapshot();
  const availability = describeEmbeddingAvailability(settings);
  const bundles = payload.searchBundles ?? [];
  const pairs = buildHybridCandidatePairs(bundles);
  if (pairs.length === 0) {
    return {
      items: payload.items,
      evidence: [...payload.evidence, `embedding:${availability.reason}`, "hybridPairs:0"],
      summary: payload.summary,
    };
  }

  try {
    const decisions = await buildHybridCandidateDecisions(settings, pairs);
    const reviewItems = decisions
      .slice(0, 4)
      .map((decision) => ({
        id: `sheet-review:${decision.id}`,
        title: `${decision.pair.left.roomNo || "-"} 판단 후보`,
        subtitle: [decision.reason, decision.pair.left.guestName || decision.pair.left.reservationNo, decision.pair.right.guestName || decision.pair.right.reservationNo]
          .filter(Boolean)
          .join(" · "),
        statusLabel:
          decision.state === "confirm"
            ? "확정"
            : decision.state === "recommend-edit"
              ? "수정 추천"
              : decision.state === "review"
                ? "검토"
                : "보류",
      }));
    const confirmCount = decisions.filter((item) => item.state === "confirm").length;
    const reviewCount = decisions.filter((item) => item.state === "review").length;
    const abstainCount = decisions.filter((item) => item.state === "abstain").length;
    return {
      items: payload.items,
      evidence: [
        ...payload.evidence,
        `embedding:${availability.reason}`,
        `hybridPairs:${pairs.length}`,
        `confirm:${confirmCount}`,
        `review:${reviewCount}`,
        `abstain:${abstainCount}`,
      ],
      summary: reviewItems.length > 0 ? `${payload.summary} 판단 후보 ${reviewItems.length}건을 계산했습니다.` : payload.summary,
    };
  } catch (error) {
    return {
      items: payload.items,
      evidence: [
        ...payload.evidence,
        `embedding:error:${error instanceof Error ? error.message : String(error)}`,
        `hybridPairs:${pairs.length}`,
      ],
      summary: `${payload.summary} 하이브리드 판단 후보 계산은 건너뛰었습니다.`,
    };
  }
}

function buildPmsSessionScript(input: AppLiveReadInput) {
  const binding = getProviderBinding(input.branch, "wings-pms");
  return buildWingsSessionReadScript({
    branch: input.branch,
    label: getAppBranchOption(input.branch).label,
    startDate: input.startDate,
    endDate: input.endDate,
    endpointPath: binding.metadata.endpointPath || "/pms/biz/ir04_0200X_V03/searchListRsvn.do",
    presetKey: binding.metadata.presetKey || "wings-reservation-list",
    propertyNo: binding.metadata.propertyNo || "",
    bsnsCode: binding.metadata.bsnsCode || "",
  });
}

function buildStationSessionScript(input: AppLiveReadInput) {
  const binding = getProviderBinding(input.branch, "admin-station");
  const stationApiOrigin = getAppProviderOption("admin-station").apiOrigin;
  const payload = {
    branch: input.branch,
    startDate: input.startDate,
    endDate: input.endDate,
    branchId: binding.metadata.branchId || "",
  };
  return `
    (async () => {
      const ctx = ${JSON.stringify(payload)};
      const normalize = (value) => typeof value === "string" ? value.trim() : "";
      const branchId = ctx.branchId || (location.pathname.match(/\\/branch\\/(\\d+)/i) || [])[1] || "";
      if (!branchId) {
        throw new Error("Station branch id is missing");
      }
      const url = new URL("/admin/branch/" + branchId + "/calendar", ${JSON.stringify(stationApiOrigin)});
      url.searchParams.set("startDate", ctx.startDate);
      url.searchParams.set("endDate", ctx.endDate);
      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        headers: { "Accept": "application/json" }
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error("Station API (" + response.status + "): " + text.slice(0, 160));
      }
      const parsed = JSON.parse(text);
      const stack = [parsed && parsed.data ? parsed.data : parsed];
      const rows = [];
      while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node)) {
          for (const item of node) stack.push(item);
          continue;
        }
        const date = normalize(node.date || node.businessDate || node.day || "");
        const roomName = normalize(node.roomName || node.name || node.bizItemName || "");
        if (date && roomName) {
          rows.push(node);
        }
        for (const value of Object.values(node)) {
          if (value && typeof value === "object") stack.push(value);
        }
      }
      const items = rows.slice(0, 4).map((row, index) => ({
        id: "station:" + index,
        title: normalize(row.roomName || row.name || row.bizItemName || "Station"),
        subtitle: [normalize(row.date || row.businessDate || ""), String(row.settingStock ?? row.stockCount ?? row.stock ?? "")].filter(Boolean).join(" · "),
        statusLabel: normalize(row.openStatus || row.status || "LIVE") || "LIVE",
      }));
      const copyText = [
        "Station OTA 원본",
        ...rows.map((row) => [
          normalize(row.roomName || row.name || row.bizItemName || ""),
          normalize(row.date || row.businessDate || row.day || ""),
          String(row.settingStock ?? row.stockCount ?? row.stock ?? ""),
          normalize(row.openStatus || row.status || ""),
        ].filter(Boolean).join(" / "))
      ].join("\\n");
      return {
        checkedAt: new Date().toISOString(),
        recordsImported: rows.length,
        summary: "Station 라이브 데이터를 읽었습니다.",
        items,
        copyText,
        evidence: [
          "provider:admin-station",
          "branch:" + ctx.branch,
          "runtimeHost:" + (location.host || "-"),
          "sessionReadiness:browser-session",
          "sourceLineage:" + url.pathname,
          "stationBranchId:" + branchId,
        ]
      };
    })()
  `;
}

function buildNaverSessionScript(input: AppLiveReadInput) {
  const binding = getProviderBinding(input.branch, "naver-partner");
  const naverApiOrigin = getAppProviderOption("naver-partner").apiOrigin;
  const payload = {
    branch: input.branch,
    startDate: input.startDate,
    endDate: input.endDate,
    businessId: binding.metadata.businessId || "",
  };
  return `
    (async () => {
      const ctx = ${JSON.stringify(payload)};
      const normalize = (value) => typeof value === "string" ? value.trim() : "";
      const businessId =
        ctx.businessId ||
        (location.pathname.match(/\\/businesses\\/(\\d+)/i) || [])[1] ||
        ((location.href.match(/[?&](?:businessId|business_id|bizId|biz_id)=(\\d+)/i) || [])[1] || "");
      if (!businessId) {
        throw new Error("Naver business id is missing");
      }
      const itemUrl = new URL("/v3.1/businesses/" + businessId + "/biz-items", ${JSON.stringify(naverApiOrigin)});
      itemUrl.searchParams.set("projections", "resource,type-value,option-category,BIZ_ITEM_AMENITY,biz-item-detail,language-resource");
      itemUrl.searchParams.set("size", "300");
      itemUrl.searchParams.set("lang", "ko");
      const itemResponse = await fetch(itemUrl.toString(), {
        method: "GET",
        credentials: "include",
        headers: { "Accept": "application/json" }
      });
      const itemText = await itemResponse.text();
      if (!itemResponse.ok) {
        throw new Error("Naver item API (" + itemResponse.status + "): " + itemText.slice(0, 160));
      }
      const itemPayload = JSON.parse(itemText);
      const items = Array.isArray(itemPayload && itemPayload.items) ? itemPayload.items : [];
      const schedules = [];
      for (const row of items.slice(0, 20)) {
        const itemId = normalize(row.bizItemId || row.id || "");
        if (!itemId) continue;
        const scheduleUrl = new URL("/v3.0/businesses/" + businessId + "/biz-items/" + itemId + "/daily-schedules", ${JSON.stringify(naverApiOrigin)});
        scheduleUrl.searchParams.set("startDateTime", ctx.startDate + "T00:00:00");
        scheduleUrl.searchParams.set("endDateTime", ctx.endDate + "T00:00:00");
        const scheduleResponse = await fetch(scheduleUrl.toString(), {
          method: "GET",
          credentials: "include",
          headers: { "Accept": "application/json" }
        });
        const scheduleText = await scheduleResponse.text();
        if (!scheduleResponse.ok) {
          throw new Error("Naver schedule API (" + scheduleResponse.status + "): " + scheduleText.slice(0, 160));
        }
        const payload = JSON.parse(scheduleText);
        for (const [date, schedule] of Object.entries(payload || {})) {
          if (!schedule || typeof schedule !== "object") continue;
          schedules.push({
            date,
            roomName: normalize(row.bizItemName || row.name || ""),
            bookingCount: schedule.bookingCount ?? schedule.reservationCount ?? schedule.currentBookingCount ?? 0,
          });
        }
      }
      const preview = schedules.slice(0, 4).map((row, index) => ({
        id: "naver:" + index,
        title: row.roomName || "Naver",
        subtitle: [row.date, String(row.bookingCount)].filter(Boolean).join(" · "),
        statusLabel: "LIVE",
      }));
      const copyText = [
        "Naver OTA 원본",
        ...schedules.map((row) => [
          row.roomName || "",
          row.date || "",
          String(row.bookingCount),
        ].filter(Boolean).join(" / "))
      ].join("\\n");
      return {
        checkedAt: new Date().toISOString(),
        recordsImported: schedules.length,
        summary: "네이버 OTA 라이브 데이터를 읽었습니다.",
        items: preview,
        copyText,
        evidence: [
          "provider:naver-partner",
          "branch:" + ctx.branch,
          "runtimeHost:" + (location.host || "-"),
          "sessionReadiness:browser-session",
          "sourceLineage:/v3.0/businesses/" + businessId + "/biz-items/:id/daily-schedules",
          "naverBusinessId:" + businessId,
        ]
      };
    })()
  `;
}

async function executeSessionRead(provider: AppProvider, script: string): Promise<ProviderSessionReadPayload> {
  const payload = await executeProviderReadScript<ProviderSessionReadPayload>(provider, script);
  if (payload.error) {
    throw new Error(payload.error);
  }
  return payload;
}

export async function runPmsRead(input: AppLiveReadInput): Promise<AppLiveReadSnapshot> {
  const branchBlocked = buildBranchBlockedRead("pms", input.branch);
  if (branchBlocked) return branchBlocked;

  const readiness = await ensureProviderReadable("wings-pms", "PMS");
  if (!readiness.ok) {
    return buildError("pms", input.branch, readiness.reason, readiness.evidence);
  }

  try {
    const payload = await executeSessionRead("wings-pms", buildPmsSessionScript(input));
    const settingsEvidence = await buildSettingsEvidence();
    return {
      source: "pms",
      branch: input.branch,
      checkedAt: payload.checkedAt,
      status: "done",
      summary: `${payload.summary} (${input.startDate} ~ ${input.endDate})`,
      recordsImported: payload.recordsImported,
      blockedReason: null,
      items: payload.items,
      copyText: payload.copyText ?? null,
      evidence: [...readiness.evidence, ...payload.evidence, `window:${input.startDate}..${input.endDate}`, ...settingsEvidence],
    };
  } catch (error) {
    return buildError("pms", input.branch, "PMS 라이브 조회에 실패했습니다.", [
      ...readiness.evidence,
      `provider:wings-pms`,
      `branch:${input.branch}`,
      `error:${error instanceof Error ? error.message : String(error)}`,
      `window:${input.startDate}..${input.endDate}`,
    ]);
  }
}

export async function runOtaRead(input: AppLiveReadInput): Promise<AppLiveReadSnapshot> {
  const branchBlocked = buildBranchBlockedRead("ota", input.branch);
  if (branchBlocked) return branchBlocked;

  const naver = await ensureProviderReadable("naver-partner", "네이버 OTA");
  const station = await ensureProviderReadable("admin-station", "Station OTA");
  if (!naver.ok && !station.ok) {
    return buildError("ota", input.branch, "OTA 세션이 준비되지 않았습니다.", [...naver.evidence, ...station.evidence]);
  }

  const successPayloads: ProviderSessionReadPayload[] = [];
  const failureEvidence: string[] = [];

  if (naver.ok) {
    try {
      successPayloads.push(await executeSessionRead("naver-partner", buildNaverSessionScript(input)));
    } catch (error) {
      failureEvidence.push(`provider:naver-partner:error:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (station.ok) {
    try {
      successPayloads.push(await executeSessionRead("admin-station", buildStationSessionScript(input)));
    } catch (error) {
      failureEvidence.push(`provider:admin-station:error:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (successPayloads.length === 0) {
    return buildError("ota", input.branch, "OTA 라이브 조회에 실패했습니다.", [
      ...naver.evidence,
      ...station.evidence,
      ...failureEvidence,
      `window:${input.startDate}..${input.endDate}`,
    ]);
  }

  const settingsEvidence = await buildSettingsEvidence();
  const items = successPayloads.flatMap((payload) => payload.items).slice(0, 8);
  const recordsImported = successPayloads.reduce((sum, payload) => sum + payload.recordsImported, 0);
  const summary = successPayloads.map((payload) => payload.summary).join(" / ");
  const evidence = successPayloads.flatMap((payload) => payload.evidence);
  const copyText = successPayloads
    .map((payload) => payload.copyText?.trim() || "")
    .filter(Boolean)
    .join("\n\n");
  return {
    source: "ota",
    branch: input.branch,
    checkedAt: successPayloads[0]?.checkedAt ?? nowIso(),
    status: "done",
    summary: `${summary} (${input.startDate} ~ ${input.endDate})`,
    recordsImported,
    blockedReason: null,
    items,
    copyText: copyText || null,
    evidence: [...naver.evidence, ...station.evidence, ...evidence, ...failureEvidence, `window:${input.startDate}..${input.endDate}`, ...settingsEvidence],
  };
}

export async function runSheetRead(input: AppLiveReadInput): Promise<AppLiveReadSnapshot> {
  const branchBlocked = buildBranchBlockedRead("sheet", input.branch);
  if (branchBlocked) return branchBlocked;

  const settings = await loadSettingsSnapshot();
  if (!settings.isConfigured) {
    return buildError("sheet", input.branch, "예약 시트 설정을 먼저 저장해 주세요.", [
      `spreadsheet:${settings.config?.spreadsheet ? "set" : "missing"}`,
      `sheetName:${settings.config?.sheetName ? "set" : "missing"}`,
    ]);
  }
  try {
    const payload = await runLiveSheetBridge(input);
    const settingsEvidence = await buildSettingsEvidence();
    const scored = await scoreSheetReviewCandidates(payload);
    return {
      source: "sheet",
      branch: input.branch,
      checkedAt: payload.checkedAt,
      status: "done",
      summary: `${scored.summary} (${input.startDate} ~ ${input.endDate})`,
      recordsImported: payload.recordsImported,
      blockedReason: null,
      items: scored.items,
      copyText: null,
      evidence: [...scored.evidence, `window:${input.startDate}..${input.endDate}`, ...settingsEvidence],
    };
  } catch (error) {
    return buildError("sheet", input.branch, "예약 시트 라이브 조회에 실패했습니다.", [
      `error:${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}
