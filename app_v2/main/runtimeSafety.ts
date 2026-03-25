import type {
  AppBranch,
  AppLiveReadSnapshot,
  AppReadSource,
  AppReservationAction,
  AppReservationActionSnapshot,
} from "../../src/desktop/app-v2-contracts.js";

interface LiveReadRuntimeErrorInput {
  source: AppReadSource;
  branch: AppBranch;
  blockedReason: string;
  evidence?: string[];
  error?: unknown;
  checkedAt?: string;
}

interface PendingSourceActionInput {
  action: Extract<AppReservationAction, "compare" | "reconcile" | "apply">;
  branch: AppBranch;
  startDate: string;
  endDate: string;
  reason: string;
  evidence?: string[];
  checkedAt?: string;
}

interface StableWingsRuntimeCacheKeyInput {
  sync: string;
  harBranches: string;
  gangnamHar: string;
  coexHar: string;
  authBundle?: {
    cookieHeader?: string;
    csrfToken?: string;
    authorization?: string;
    sourceHost?: string;
    capturedAt?: string;
  } | null;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildLiveReadRuntimeErrorSnapshot(input: LiveReadRuntimeErrorInput): AppLiveReadSnapshot {
  const errorMessage = input.error instanceof Error ? input.error.message : normalizeText(input.error);
  return {
    source: input.source,
    branch: input.branch,
    checkedAt: input.checkedAt || nowIso(),
    status: "error",
    summary: input.blockedReason,
    recordsImported: 0,
    blockedReason: input.blockedReason,
    items: [],
    evidence: [...(input.evidence || []), ...(errorMessage ? [`error:${errorMessage}`] : [])],
  };
}

export function buildPendingSourceActionSnapshot(input: PendingSourceActionInput): AppReservationActionSnapshot {
  return {
    action: input.action,
    branch: input.branch,
    startDate: input.startDate,
    endDate: input.endDate,
    checkedAt: input.checkedAt || nowIso(),
    status: "done",
    summary: input.reason,
    evidence: [...(input.evidence || []), "engineStatus:pending-source"],
    rows: [
      {
        id: `${input.action}-pending`,
        primary: "source bundle 대기",
        secondary: "source bundle이 아직 없어 PMS/OTA raw source records가 필요합니다.",
        statusLabel: "PENDING",
        detail: "source-bundle-missing",
      },
    ],
    outputPath: null,
    engineStatus: "pending-source",
    issueCount: 0,
    planToken: "",
    requiresApproval: false,
    applyAllowed: false,
  };
}

export function buildStableWingsRuntimeCacheKey(input: StableWingsRuntimeCacheKeyInput) {
  return JSON.stringify({
    sync: normalizeText(input.sync),
    harBranches: normalizeText(input.harBranches),
    gangnamHar: normalizeText(input.gangnamHar),
    coexHar: normalizeText(input.coexHar),
    authBundle: {
      cookieHeader: normalizeText(input.authBundle?.cookieHeader),
      csrfToken: normalizeText(input.authBundle?.csrfToken),
      authorization: normalizeText(input.authBundle?.authorization),
      sourceHost: normalizeText(input.authBundle?.sourceHost),
    },
  });
}
