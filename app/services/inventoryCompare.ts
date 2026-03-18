import type { RuntimeMode, LiveSupportLevel } from "../contracts";
import type { ProviderInventoryCompareRow } from "../contracts";
import type { ProviderType } from "../contracts";
import type { InventoryCompareRow, InventoryCompareSnapshot } from "../renderer/types";

const FIXTURE_ROWS: Record<RuntimeMode, InventoryCompareRow[]> = {
  preview: [
    {
      id: "urban-0312",
      date: "2026-03-12",
      roomType: "Urban",
      channel: "NAVER",
      siteRaw: "4/6",
      sheetRaw: "6/6",
      diff: "-2",
      status: "mismatch",
      reason: "site sold count lagging behind sheet snapshot",
      action: "bridge live read before apply"
    },
    {
      id: "urban-0313",
      date: "2026-03-13",
      roomType: "Urban",
      channel: "STATION",
      siteRaw: "4/6",
      sheetRaw: "6/6",
      diff: "-2",
      status: "mismatch",
      reason: "raw row and derived row disagree",
      action: "compare provider row vs value row"
    },
    {
      id: "double-0313",
      date: "2026-03-13",
      roomType: "Double Twin",
      channel: "NAVER",
      siteRaw: "2/3",
      sheetRaw: "2/3",
      diff: "0",
      status: "match",
      reason: "sheet and provider aligned",
      action: "keep"
    },
    {
      id: "grand-0314",
      date: "2026-03-14",
      roomType: "Grand",
      channel: "STATION",
      siteRaw: "closed",
      sheetRaw: "0/1",
      diff: "warn",
      status: "warning",
      reason: "provider closed text parsed via fallback",
      action: "require dom snapshot on live bridge"
    }
  ],
  history: [
    {
      id: "urban-0312-history",
      date: "2026-03-12",
      roomType: "Urban",
      channel: "NAVER",
      siteRaw: "5/6",
      sheetRaw: "6/6",
      diff: "-1",
      status: "warning",
      reason: "history artifact shows prior mismatch narrowing",
      action: "compare against fresh site read"
    },
    {
      id: "double-0313-history",
      date: "2026-03-13",
      roomType: "Double Twin",
      channel: "STATION",
      siteRaw: "2/3",
      sheetRaw: "2/3",
      diff: "0",
      status: "match",
      reason: "history snapshot and sheet aligned",
      action: "keep"
    },
    {
      id: "grand-0314-history",
      date: "2026-03-14",
      roomType: "Grand",
      channel: "NAVER",
      siteRaw: "1/1",
      sheetRaw: "0/1",
      diff: "+1",
      status: "mismatch",
      reason: "provider row recovered but sheet not updated",
      action: "reservation audit before apply"
    }
  ],
  live: []
};

function getSupportLevel(
  mode: RuntimeMode,
  options?: { liveContextAvailable?: boolean; liveRowsLoaded?: boolean }
): LiveSupportLevel {
  if (mode !== "live") return "preview-only";
  if (!options?.liveContextAvailable) return "offline-preview";
  if (!options.liveRowsLoaded) return "partial-live";
  return "read-live";
}

function getSourceLabel(
  mode: RuntimeMode,
  options?: { sourceLabel?: string; liveContextAvailable?: boolean; liveRowsLoaded?: boolean }
) {
  if (mode !== "live") {
    return options?.sourceLabel || (mode === "history" ? "History artifact snapshot" : "Preview snapshot");
  }
  return getSupportLevel(mode, options);
}

function normalizeLiveRow(
  row: ProviderInventoryCompareRow,
  index: number,
  provider: ProviderType
): InventoryCompareRow | null {
  const rowProvider = row.provider || provider;
  const branch = String(row.branch || "").trim() || undefined;
  const date = String(row.date || "").trim();
  const roomType = String(row.roomType || "").trim();
  const channel = String(row.channel || "").trim() || provider;
  const siteRaw = String(row.siteRaw || "").trim();
  const sheetRaw = String(row.sheetRaw || "").trim();
  if (!date || !roomType || !channel || !siteRaw || !sheetRaw) return null;
  const status: InventoryCompareRow["status"] = row.status || (siteRaw === sheetRaw ? "match" : "mismatch");
  return {
    id: `${rowProvider}-${date}-${roomType}-${channel}-${index}`,
    branch,
    date,
    roomType,
    channel,
    siteRaw,
    sheetRaw,
    diff: String(row.diff || (siteRaw === sheetRaw ? "0" : "delta")).trim(),
    status,
    reason: String(row.reason || "live provider row loaded").trim(),
    action: String(row.action || (status === "match" ? "keep" : "review before apply")).trim()
  };
}

function buildLines(
  mode: RuntimeMode,
  rows: InventoryCompareRow[],
  options?: {
    usedDomFallback?: boolean;
    sourceLabel?: string;
    liveContextAvailable?: boolean;
    liveRowsLoaded?: boolean;
    branch?: string;
  }
) {
  const mismatches = rows.filter((row) => row.status === "mismatch");
  const warnings = rows.filter((row) => row.status === "warning");
  const source = options?.sourceLabel || mode;
  const branch = String(options?.branch || "ALL").trim() || "ALL";
  const supportLevel = getSupportLevel(mode, {
    liveContextAvailable: options?.liveContextAvailable,
    liveRowsLoaded: options?.liveRowsLoaded
  });

  return {
    evidenceLines: [
      `Compare source: ${source}`,
      `Branch scope: ${branch}`,
      `Mismatch rows: ${mismatches.length}`,
      mode === "live"
        ? rows.length > 0
          ? `Live rows prepared: ${rows.length}`
          : supportLevel === "read-live"
            ? "Live connector returned no rows for the selected window"
            : `Live rows prepared: ${rows.length}`
        : `Rows prepared: ${rows.length}`,
      ...mismatches.slice(0, 3).map((row) => `${row.date} ${row.roomType} ${row.channel} ${row.siteRaw} vs ${row.sheetRaw}`)
    ],
    opsLines: [
      "Bridge runtime path: context + live fetch + diff materialization",
      `Support level: ${supportLevel}`,
      mode === "live"
        ? `DOM fallback used: ${options?.usedDomFallback ? "yes" : "no"}`
        : "DOM fallback used: fixture n/a",
      supportLevel === "read-live"
        ? rows.length > 0
          ? "Live rows materialized and diff-ready"
          : "Live context ready, no rows in selected range"
        : supportLevel === "partial-live"
          ? "Live context authenticated, but row materialization pending"
          : "Live context unavailable, using read-only fallback"
    ],
    validationLines: [
      rows.some((row) => row.status === "mismatch")
        ? "Validation gate: mismatch rows remain, apply blocked"
        : "Validation gate: no mismatch rows",
      mode === "live"
        ? supportLevel === "read-live"
          ? rows.length > 0
            ? "Validation gate: live rows loaded for read-only compare"
            : "Validation gate: live connector ready but window is empty"
          : supportLevel === "partial-live"
            ? "Validation gate: partial-live context available, data not yet materialized"
            : "Validation gate: live bridge missing, offline preview active"
        : "Validation gate: preview snapshot loaded"
    ],
    logs: [
      `Inventory compare loaded for ${source}.`,
      `Rows prepared: ${rows.length}`,
      mismatches.length > 0 ? `Mismatch summary built: ${mismatches.length}` : "No mismatches detected in current set.",
      supportLevel === "read-live"
        ? rows.length > 0
          ? `Live diff materialized: ${rows.length}`
          : "Live diff materialization complete with empty result"
        : supportLevel === "partial-live"
          ? "Live context authenticated, awaiting row hydration"
          : "Live data unavailable, operating in read-only fallback state"
    ]
  };
}

export async function loadInventoryCompareSnapshot(
  mode: RuntimeMode
): Promise<InventoryCompareSnapshot> {
  const rows = FIXTURE_ROWS[mode];
  const mismatchCount = rows.filter((row) => row.status === "mismatch").length;
  const warningCount = rows.filter((row) => row.status === "warning").length;
  const matchedCount = rows.filter((row) => row.status === "match").length;
  const lineSet = buildLines(mode, rows);
  const sourceLabel = getSourceLabel(mode, {
    liveContextAvailable: false,
    liveRowsLoaded: false
  });

  return {
    title: "Inventory Compare",
    supportLevel: getSupportLevel(mode, { liveContextAvailable: false, liveRowsLoaded: false }),
    sourceLabel,
    lastRunAt: new Date().toISOString(),
    rows,
    mismatchCount,
    warningCount,
    matchedCount,
    ...lineSet
  };
}

export function buildInventoryCompareSnapshot(params: {
  mode: RuntimeMode;
  sourceLabel: string;
  liveRows?: ProviderInventoryCompareRow[];
  liveProvider?: ProviderType;
  usedDomFallback?: boolean;
  liveContextAvailable?: boolean;
  branch?: string;
}): InventoryCompareSnapshot {
  const {
    mode,
    sourceLabel,
    liveRows = [],
    liveProvider = "naver-partner",
    usedDomFallback = false,
    liveContextAvailable = false,
    branch = "ALL"
  } = params;

  if (mode !== "live") {
    const rows = FIXTURE_ROWS[mode];
    const mismatchCount = rows.filter((row) => row.status === "mismatch").length;
    const warningCount = rows.filter((row) => row.status === "warning").length;
    const matchedCount = rows.filter((row) => row.status === "match").length;
    return {
      title: "Inventory Compare",
      supportLevel: getSupportLevel(mode, { liveContextAvailable: false, liveRowsLoaded: false }),
      sourceLabel,
      lastRunAt: new Date().toISOString(),
      rows,
      mismatchCount,
      warningCount,
      matchedCount,
      ...buildLines(mode, rows, { sourceLabel, branch })
    };
  }

  const normalizedRows = liveRows
    .map((row, index) => normalizeLiveRow(row, index, liveProvider))
    .filter((row): row is InventoryCompareRow => Boolean(row));
  const liveRowsLoaded = normalizedRows.length > 0;
  const supportLevel = getSupportLevel("live", {
    liveContextAvailable,
    liveRowsLoaded
  });
  const normalizedSourceLabel = getSourceLabel("live", {
    sourceLabel,
    liveContextAvailable,
    liveRowsLoaded
  });
  const rows = normalizedRows;
  const mismatchCount = rows.filter((row) => row.status === "mismatch").length;
  const warningCount = rows.filter((row) => row.status === "warning").length;
  const matchedCount = rows.filter((row) => row.status === "match").length;

  return {
    title: "Inventory Compare",
    supportLevel,
    sourceLabel: normalizedSourceLabel,
    lastRunAt: new Date().toISOString(),
    rows,
    mismatchCount,
    warningCount,
    matchedCount,
    ...buildLines(mode, rows, {
      sourceLabel: normalizedSourceLabel,
      usedDomFallback,
      liveContextAvailable,
      liveRowsLoaded,
      branch
    })
  };
}
