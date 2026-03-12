import type { LiveSupportLevel, ProviderReservationRow, RuntimeMode } from "../contracts";
import type { BridgeSummary } from "../renderer/types";
import type { ReservationAuditRow, ReservationAuditSnapshot } from "../renderer/types";

const FIXTURE_ROWS: Record<RuntimeMode, ReservationAuditRow[]> = {
  "dry-run": [
    {
      id: "rsvn-240312-kim",
      reservationNo: "240312-001",
      guestName: "김지연",
      channel: "NAVER",
      checkin: "2026-03-12",
      checkout: "2026-03-13",
      status: "ACTIVE",
      auditStatus: "anomaly",
      reason: "OTA ACTIVE지만 PMS remark에 night audit 흔적이 남아 있습니다.",
      action: "remark / PMS source row 확인"
    },
    {
      id: "rsvn-240313-park",
      reservationNo: "240313-014",
      guestName: "박서준",
      channel: "STATION",
      checkin: "2026-03-13",
      checkout: "2026-03-15",
      status: "ACTIVE",
      auditStatus: "review",
      reason: "전화 끝자리와 OTA token hash는 맞지만 객실 표현이 달라 review가 필요합니다.",
      action: "room alias / note head 검증"
    },
    {
      id: "rsvn-240314-choi",
      reservationNo: "240314-102",
      guestName: "최은정",
      channel: "WINGS",
      checkin: "2026-03-14",
      checkout: "2026-03-16",
      status: "CANCELED",
      auditStatus: "ok",
      reason: "취소 상태가 OTA / PMS 모두 일치합니다.",
      action: "keep"
    }
  ],
  replay: [
    {
      id: "replay-240312-kim",
      reservationNo: "240312-001",
      guestName: "김지연",
      channel: "NAVER",
      checkin: "2026-03-12",
      checkout: "2026-03-13",
      status: "ACTIVE",
      auditStatus: "review",
      reason: "replay artifact에서 anomaly가 줄었지만 remark hash가 아직 남아 있습니다.",
      action: "fresh PMS read와 대조"
    },
    {
      id: "replay-240315-yoon",
      reservationNo: "240315-021",
      guestName: "윤아린",
      channel: "STATION",
      checkin: "2026-03-15",
      checkout: "2026-03-16",
      status: "ACTIVE",
      auditStatus: "ok",
      reason: "replay artifact 기준 OTA/PMS 주요 식별자가 일치합니다.",
      action: "keep"
    }
  ],
  live: [
    {
      id: "live-audit-pending",
      reservationNo: "pending",
      guestName: "bridge pending",
      channel: "WINGS",
      checkin: "2026-03-12",
      checkout: "2026-03-15",
      status: "ACTIVE",
      auditStatus: "review",
      reason: "Wings runtime material이 아직 없어 audit fixture 상태만 표시합니다.",
      action: "attach Wings bridge auth or HAR-backed sync config"
    }
  ]
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasLiveRows(rows: ReservationAuditRow[]) {
  return rows.length > 0 && rows[0]?.reservationNo !== "pending";
}

function getSupportLevel(
  mode: RuntimeMode,
  options?: { liveContextAvailable?: boolean; hasUpstreamAuth?: boolean; hasReservationRows?: boolean }
): LiveSupportLevel {
  if (mode !== "live") return "dry-run-only";
  if (!options?.liveContextAvailable) return "fixture-fallback";
  if (options.hasReservationRows) return "read-live";
  if (options.hasUpstreamAuth) return "partial-live";
  return "fixture-fallback";
}

function getSourceLabel(
  mode: RuntimeMode,
  options?: { liveContextAvailable?: boolean; hasUpstreamAuth?: boolean; hasReservationRows?: boolean; sourceLabel?: string }
) {
  if (mode !== "live") {
    return options?.sourceLabel || (mode === "replay" ? "Replay audit fixture" : "Dry-run audit fixture");
  }
  return options?.sourceLabel || getSupportLevel(mode, options);
}

function buildReasonForLiveRow(row: ProviderReservationRow, auditStatus: ReservationAuditRow["auditStatus"]) {
  const branch = normalizeText(row.branch) || "unknown-branch";
  const endpoint = normalizeText(row.endpointCapability) || "reservation_lookup";
  const sourceCode = normalizeText(row.sourceCode) || "unknown-source";
  const language = normalizeText(row.languageName || row.languageCode || row.nationalityCode) || "unclassified";
  if (auditStatus === "anomaly") {
    return `Wings status anomaly detected. branch=${branch} source=${sourceCode} endpoint=${endpoint}`;
  }
  if (auditStatus === "review") {
    const missing: string[] = [];
    if (!normalizeText(row.branch)) missing.push("branch");
    if (!normalizeText(row.sourceCode)) missing.push("source");
    if (normalizeText(row.nationalityCode) && !normalizeText(row.languageCode)) missing.push("language");
    return `Live Wings row joined but ${missing.join(", ") || "supporting"} evidence needs review. endpoint=${endpoint} source=${sourceCode}`;
  }
  return `Live Wings reservation joined. branch=${branch} source=${sourceCode} language=${language}`;
}

function buildActionForLiveRow(row: ProviderReservationRow, auditStatus: ReservationAuditRow["auditStatus"]) {
  if (auditStatus === "anomaly") {
    return "remark / status / reservation detail 확인";
  }
  if (auditStatus === "review") {
    if (normalizeText(row.nationalityCode) && !normalizeText(row.languageCode)) {
      return "nationality/language lookup 확인";
    }
    if (!normalizeText(row.sourceCode)) {
      return "source catalog 확인";
    }
    return "branch / identity evidence 검증";
  }
  return "keep";
}

function mapLiveReservationRow(row: ProviderReservationRow, index: number): ReservationAuditRow {
  const canceled = normalizeText(row.statusBucket || row.status).toUpperCase().includes("CANCEL");
  const auditStatus: ReservationAuditRow["auditStatus"] = row.auditAnomaly
    ? "anomaly"
    : !normalizeText(row.branch) || !normalizeText(row.sourceCode) || (normalizeText(row.nationalityCode) && !normalizeText(row.languageCode))
      ? "review"
      : "ok";
  const branchKey = normalizeText(row.branch || "").toLowerCase() || "na";
  return {
    id: `${row.reservationNo}-${row.checkin}-${branchKey || index}`,
    reservationNo: normalizeText(row.reservationNo) || `unknown-${index + 1}`,
    guestName: normalizeText(row.guestName) || "Guest Pending",
    channel: normalizeText(row.channel || row.sourceCode) || "WINGS",
    checkin: normalizeText(row.checkin),
    checkout: normalizeText(row.checkout),
    status: canceled ? "CANCELED" : "ACTIVE",
    auditStatus,
    reason: buildReasonForLiveRow(row, auditStatus),
    action: buildActionForLiveRow(row, auditStatus),
    branch: normalizeText(row.branch) || undefined,
    sourceCode: normalizeText(row.sourceCode) || undefined,
    nationalityCode: normalizeText(row.nationalityCode) || undefined,
    languageCode: normalizeText(row.languageCode) || undefined,
    languageName: normalizeText(row.languageName) || undefined,
    endpointCapability: normalizeText(row.endpointCapability) || undefined,
    roomNo: normalizeText(row.roomNo) || undefined
  };
}

function buildLiveAuditRows(rows: ProviderReservationRow[]) {
  return rows
    .filter((row) => normalizeText(row.reservationNo) && normalizeText(row.checkin) && normalizeText(row.checkout))
    .map((row, index) => mapLiveReservationRow(row, index));
}

function buildLines(
  mode: RuntimeMode,
  rows: ReservationAuditRow[],
  options?: {
    sourceLabel?: string;
    liveContextAvailable?: boolean;
    bridgeSummary?: BridgeSummary | null;
    branch?: string;
  }
) {
  const anomalies = rows.filter((row) => row.auditStatus === "anomaly");
  const reviews = rows.filter((row) => row.auditStatus === "review");
  const sourceLabel = options?.sourceLabel || mode;
  const authSummary = options?.bridgeSummary?.authSummary;
  const infoSummary = options?.bridgeSummary?.infoSummary;
  const branch = String(options?.branch || "ALL").trim() || "ALL";
  const liveBranches = rows.map((row) => normalizeText(row.branch)).filter(Boolean);
  const liveSources = rows.map((row) => normalizeText(row.sourceCode)).filter(Boolean);

  return {
    evidenceLines: [
      `Audit source: ${sourceLabel}`,
      `Branch scope: ${branch}`,
      `Audit anomalies: ${anomalies.length}`,
      rows.length > 0 && hasLiveRows(rows)
        ? `Live rows: ${rows.length} / branches ${Array.from(new Set(liveBranches)).join(", ") || "unknown"} / sources ${Array.from(new Set(liveSources)).join(", ") || "unknown"}`
        : `Fixture rows: ${rows.length}`,
      ...anomalies.slice(0, 3).map((row) => `${row.reservationNo} ${row.guestName} ${row.channel} ${row.reason}`)
    ],
    opsLines: [
      "Reservation retention: reservation_no, ota, date, nights, room, guest, phone tail, token hash",
      `Support level: ${getSupportLevel(mode, {
        liveContextAvailable: options?.liveContextAvailable,
        hasUpstreamAuth: Boolean(authSummary?.cookieCount || authSummary?.hasBearer),
        hasReservationRows: hasLiveRows(rows)
      })}`,
      mode === "live"
        ? `Live workspace materials: ${authSummary?.cookieCount || authSummary?.hasBearer ? "available" : "unavailable"}`
        : "Live workspace materials: fixture n/a",
      mode === "live"
        ? `Live provider summary: rows ${infoSummary?.count ?? 0} / channels ${(infoSummary?.channels || []).join(", ") || "none"}`
        : `Manual review candidates: ${reviews.length}`
    ],
    validationLines: [
      anomalies.length > 0
        ? "Validation gate: audit anomalies remain, apply-review stays blocked"
        : reviews.length > 0
          ? "Validation gate: anomaly cleared, review items remain"
          : "Validation gate: audit anomalies clear",
      mode === "live"
        ? hasLiveRows(rows)
          ? "Validation gate: reservation rows connected through provider.fetchReservations"
          : options?.liveContextAvailable
            ? "Validation gate: bridge auth summary connected, reservation rows still on fixture fallback"
            : "Validation gate: bridge auth missing, reservation audit fixture fallback active"
        : "Validation gate: reservation audit fixture loaded"
    ],
    logs: [
      `Reservation audit loaded for ${sourceLabel}.`,
      `Audit rows prepared: ${rows.length}`,
      hasLiveRows(rows)
        ? `Live reservation hydration active: ${rows.length} rows`
        : anomalies.length > 0
          ? `Audit anomaly summary built: ${anomalies.length}`
          : "No audit anomalies detected in current set."
    ]
  };
}

function buildSnapshot(
  mode: RuntimeMode,
  rows: ReservationAuditRow[],
  options?: {
    sourceLabel?: string;
    liveContextAvailable?: boolean;
    bridgeSummary?: BridgeSummary | null;
    branch?: string;
  }
): ReservationAuditSnapshot {
  const anomalyCount = rows.filter((row) => row.auditStatus === "anomaly").length;
  const reviewCount = rows.filter((row) => row.auditStatus === "review").length;
  const activeCount = rows.filter((row) => row.status === "ACTIVE").length;
  const canceledCount = rows.filter((row) => row.status === "CANCELED").length;
  const hasUpstreamAuth = Boolean(options?.bridgeSummary?.authSummary?.cookieCount || options?.bridgeSummary?.authSummary?.hasBearer);
  const hasReservationRows = hasLiveRows(rows);
  const normalizedSourceLabel = getSourceLabel(mode, {
    sourceLabel: options?.sourceLabel,
    liveContextAvailable: options?.liveContextAvailable,
    hasUpstreamAuth,
    hasReservationRows
  });
  return {
    title: "Reservation Audit",
    supportLevel: getSupportLevel(mode, {
      liveContextAvailable: options?.liveContextAvailable,
      hasUpstreamAuth,
      hasReservationRows
    }),
    sourceLabel: normalizedSourceLabel,
    lastRunAt: new Date().toISOString(),
    rows,
    anomalyCount,
    reviewCount,
    activeCount,
    canceledCount,
    ...buildLines(mode, rows, {
      ...options,
      sourceLabel: normalizedSourceLabel
    })
  };
}

export async function loadReservationAuditSnapshot(mode: RuntimeMode): Promise<ReservationAuditSnapshot> {
  return buildSnapshot(mode, FIXTURE_ROWS[mode], {
    sourceLabel: getSourceLabel(mode, { liveContextAvailable: false, hasUpstreamAuth: false, hasReservationRows: false })
  });
}

export function buildReservationAuditSnapshot(params: {
  mode: RuntimeMode;
  bridgeSummary?: BridgeSummary | null;
  liveContextAvailable?: boolean;
  liveReservationRows?: ProviderReservationRow[] | null;
  sourceLabel?: string;
  branch?: string;
}): ReservationAuditSnapshot {
  const {
    mode,
    bridgeSummary = null,
    liveContextAvailable = false,
    liveReservationRows = null,
    sourceLabel,
    branch = "ALL"
  } = params;

  if (mode !== "live") {
    return buildSnapshot(mode, FIXTURE_ROWS[mode], { sourceLabel, bridgeSummary, liveContextAvailable, branch });
  }

  const liveRows = buildLiveAuditRows(Array.isArray(liveReservationRows) ? liveReservationRows : []);
  if (liveRows.length > 0) {
    return buildSnapshot("live", liveRows, {
      sourceLabel: sourceLabel || "read-live",
      bridgeSummary,
      liveContextAvailable,
      branch
    });
  }

  const rows =
    liveContextAvailable && (bridgeSummary?.authSummary?.cookieCount || bridgeSummary?.authSummary?.hasBearer)
      ? FIXTURE_ROWS.live.map((row) => ({
          ...row,
          reason:
            bridgeSummary?.infoSummary?.count && bridgeSummary.infoSummary.count > 0
              ? `live provider summary is connected, but reservation rows are still using fallback. rows=${bridgeSummary.infoSummary.count}`
              : row.reason
        }))
      : FIXTURE_ROWS.live;

  return buildSnapshot("live", rows, {
    sourceLabel: sourceLabel || "fixture-fallback",
    bridgeSummary,
    liveContextAvailable,
    branch
  });
}
