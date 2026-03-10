import type { RuntimeMode, LiveSupportLevel } from "../contracts";
import type { InventoryCompareRow, InventoryCompareSnapshot } from "../renderer/types";

const FIXTURE_ROWS: Record<RuntimeMode, InventoryCompareRow[]> = {
  "dry-run": [
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
  replay: [
    {
      id: "urban-0312-replay",
      date: "2026-03-12",
      roomType: "Urban",
      channel: "NAVER",
      siteRaw: "5/6",
      sheetRaw: "6/6",
      diff: "-1",
      status: "warning",
      reason: "replay artifact shows prior mismatch narrowing",
      action: "compare against fresh site read"
    },
    {
      id: "double-0313-replay",
      date: "2026-03-13",
      roomType: "Double Twin",
      channel: "STATION",
      siteRaw: "2/3",
      sheetRaw: "2/3",
      diff: "0",
      status: "match",
      reason: "replay and sheet aligned",
      action: "keep"
    },
    {
      id: "grand-0314-replay",
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
  live: [
    {
      id: "live-blocked",
      date: "2026-03-12",
      roomType: "Bridge Pending",
      channel: "NAVER/STATION",
      siteRaw: "pending",
      sheetRaw: "fixture only",
      diff: "n/a",
      status: "warning",
      reason: "live read contract is not connected yet",
      action: "implement bridge.getContext and provider.fetchRows"
    }
  ]
};

function getSupportLevel(mode: RuntimeMode): LiveSupportLevel {
  return mode === "live" ? "read-live" : "dry-run-only";
}

function buildLines(mode: RuntimeMode, rows: InventoryCompareRow[]) {
  const mismatches = rows.filter((row) => row.status === "mismatch");
  const warnings = rows.filter((row) => row.status === "warning");

  return {
    evidenceLines: [
      `Compare source: ${mode}`,
      `Mismatch rows: ${mismatches.length}`,
      ...mismatches.slice(0, 3).map((row) => `${row.date} ${row.roomType} ${row.channel} ${row.siteRaw} vs ${row.sheetRaw}`)
    ],
    opsLines: [
      "Bridge contract path: bridge.getContext -> provider.fetchRows -> provider.domSnapshot",
      `Support level: ${getSupportLevel(mode)}`,
      warnings.length > 0
        ? `Warnings requiring manual review: ${warnings.length}`
        : "No manual-review warnings in current fixture"
    ],
    validationLines: [
      rows.some((row) => row.status === "mismatch")
        ? "Validation gate: mismatch rows remain, apply blocked"
        : "Validation gate: no mismatch rows",
      mode === "live"
        ? "Validation gate: live bridge missing, fixture fallback active"
        : "Validation gate: fixture snapshot loaded"
    ],
    logs: [
      `Inventory compare loaded for ${mode} mode.`,
      `Rows prepared: ${rows.length}`,
      mismatches.length > 0 ? `Mismatch summary built: ${mismatches.length}` : "No mismatches detected in current set."
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
  const sourceLabel =
    mode === "live" ? "Bridge pending, fixture fallback" : mode === "replay" ? "Replay artifact fixture" : "Dry-run fixture";

  return {
    title: "Inventory Compare",
    supportLevel: getSupportLevel(mode),
    sourceLabel,
    lastRunAt: new Date().toISOString(),
    rows,
    mismatchCount,
    warningCount,
    matchedCount,
    ...lineSet
  };
}
