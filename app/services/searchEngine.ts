import type { InventoryCompareRow, ReservationAuditRow, SearchResult, WorkspaceMockState } from "../renderer/types";

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function matchesQuery(query: string, values: unknown[]) {
  const normalized = normalizeText(query);
  if (!normalized) return false;
  return values.some((value) => normalizeText(value).includes(normalized));
}

function buildInventoryRowResult(row: InventoryCompareRow): SearchResult {
  return {
    id: `inventory:${row.id}`,
    kind: "inventory-row",
    title: `${row.date} ${row.roomType} ${row.channel}`,
    excerpt: `${row.siteRaw} vs ${row.sheetRaw} | ${row.reason}`
  };
}

function buildReservationAuditRowResult(row: ReservationAuditRow): SearchResult {
  return {
    id: `audit:${row.id}`,
    kind: "audit-row",
    title: `${row.reservationNo} ${row.guestName} ${row.channel}`,
    excerpt: `${row.checkin} -> ${row.checkout} | ${row.reason}`
  };
}

function buildLineResult(kind: SearchResult["kind"], line: string, index: number): SearchResult {
  return {
    id: `${kind}:${index}:${line}`,
    kind,
    title: kind.toUpperCase(),
    excerpt: line
  };
}

export function runWorkspaceSearch(state: WorkspaceMockState, query: string): SearchResult[] {
  const normalized = normalizeText(query);
  if (!normalized) return [];

  const results: SearchResult[] = [];
  const inventoryRows = state.inventoryCompare?.rows ?? [];
  const reservationAuditRows = state.reservationAudit?.rows ?? [];
  const evidenceLines = state.evidenceLines ?? [];
  const opsLines = state.opsLines ?? [];
  const validationLines = state.validationLines ?? [];
  const logs = state.logs ?? [];

  inventoryRows.forEach((row) => {
    if (
      matchesQuery(normalized, [
        row.date,
        row.roomType,
        row.channel,
        row.siteRaw,
        row.sheetRaw,
        row.reason,
        row.action
      ])
    ) {
      results.push(buildInventoryRowResult(row));
    }
  });
  reservationAuditRows.forEach((row) => {
    if (
      matchesQuery(normalized, [
        row.reservationNo,
        row.guestName,
        row.channel,
        row.checkin,
        row.checkout,
        row.status,
        row.auditStatus,
        row.reason,
        row.action
      ])
    ) {
      results.push(buildReservationAuditRowResult(row));
    }
  });

  evidenceLines.forEach((line, index) => {
    if (matchesQuery(normalized, [line])) results.push(buildLineResult("evidence", line, index));
  });
  opsLines.forEach((line, index) => {
    if (matchesQuery(normalized, [line])) results.push(buildLineResult("ops", line, index));
  });
  validationLines.forEach((line, index) => {
    if (matchesQuery(normalized, [line])) results.push(buildLineResult("validation", line, index));
  });
  logs.forEach((line, index) => {
    if (matchesQuery(normalized, [line])) results.push(buildLineResult("log", line, index));
  });

  return results.slice(0, 12);
}
