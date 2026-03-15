import type { SavedBindingDecision } from "../contracts/provider.js";
import type {
  BranchSelection,
  SheetReadSnapshot,
  SheetRef,
  SheetTerm,
  TermBinding,
  UnresolvedBinding
} from "../renderer/types.js";

export interface BindingDraftSnapshot {
  sheetRef: SheetRef | null;
  sheetTerms: SheetTerm[];
  termBindings: TermBinding[];
  unresolvedBindings: UnresolvedBinding[];
}

const STAGE_B_SHEET_TERMS: SheetTerm[] = [
  {
    termId: "inventory.room-map",
    canonicalName: "inventory.room-map",
    synonyms: ["room map", "room type map", "roomTypeByRoomNo"],
    datatype: "mapping",
    description: "Room number to room type anchor map"
  },
  {
    termId: "inventory.provider-value-row",
    canonicalName: "inventory.provider-value-row",
    synonyms: ["provider value row", "inventory value row"],
    datatype: "row-reference",
    description: "Provider inventory value source row"
  },
  {
    termId: "inventory.room-type-range",
    canonicalName: "inventory.room-type-range",
    synonyms: ["room type range", "room rows"],
    datatype: "grid-range",
    description: "Room type section range"
  },
  {
    termId: "sheet.scan-config",
    canonicalName: "sheet.scan-config",
    synonyms: ["scan config", "named range", "developer metadata"],
    datatype: "config",
    description: "Sheet scan configuration anchors"
  }
];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKeyPart(value: unknown) {
  return normalizeText(value).toLowerCase();
}

export function buildSheetRef(summary: SheetReadSnapshot["summary"], branch: BranchSelection): SheetRef | null {
  if (!summary) return null;
  return {
    spreadsheetId: normalizeText(summary.spreadsheetId),
    sheetName: normalizeText(summary.sheetName),
    sheetId: null,
    branch,
    timezone: "Asia/Seoul"
  };
}

function buildAnchorId(sheetRef: SheetRef, kind: string, scope: string) {
  return `${sheetRef.spreadsheetId || "unknown"}:${sheetRef.sheetName || "unknown"}:${kind}:${scope}`;
}

export function buildGeneratedBindingDraft(sheetRead: SheetReadSnapshot, branch: BranchSelection): BindingDraftSnapshot {
  const summary = sheetRead.summary;
  const sheetRef = buildSheetRef(summary, branch);
  if (!summary || !sheetRef) {
    return {
      sheetRef,
      sheetTerms: [...STAGE_B_SHEET_TERMS],
      termBindings: [],
      unresolvedBindings: []
    };
  }

  const unresolvedBindings: UnresolvedBinding[] = [];
  const pushUnresolved = (
    kind: "named-range" | "developer-metadata" | "grid-hash",
    scope: string,
    rawHeader: string,
    candidateTerms: string[],
    reason: string,
    sampleValues: string[] = []
  ) => {
    unresolvedBindings.push({
      anchorId: buildAnchorId(sheetRef, kind, scope),
      rawHeader,
      sampleValues,
      candidateTerms,
      reason,
      status: "open"
    });
  };

  if (!summary.hintSummary.hasRoomTypeMap) {
    pushUnresolved(
      "named-range",
      "room-map",
      "roomTypeByRoomNo",
      ["inventory.room-map"],
      "room-map-missing",
      [summary.hintSummary.fingerprint].filter(Boolean)
    );
  }

  if (!summary.anchorSummary.hasScanConfigNamedRange && !summary.anchorSummary.hasMetadataScanConfig) {
    pushUnresolved(
      "developer-metadata",
      "scan-config",
      "scanConfig",
      ["sheet.scan-config"],
      "scan-config-anchor-missing"
    );
  }

  for (const issueCode of summary.validationSummary.issueCodes) {
    const upperCode = normalizeText(issueCode).toUpperCase();
    if (!upperCode) continue;

    if (upperCode.includes("PROVIDER_VALUE_ROW_MISSING")) {
      pushUnresolved(
        "grid-hash",
        `${summary.validationSummary.providerKey || "provider"}:value-row`,
        upperCode,
        ["inventory.provider-value-row"],
        "provider-value-row-missing"
      );
      continue;
    }

    if (upperCode.includes("ROOM_TYPE") || upperCode.includes("ROOM_ROWS")) {
      pushUnresolved(
        "grid-hash",
        "room-type-range",
        upperCode,
        ["inventory.room-type-range"],
        "room-type-range-unresolved"
      );
      continue;
    }

    if (upperCode.includes("ROOM_MAP") || upperCode.includes("MAPPING") || upperCode.includes("ALIAS") || upperCode.includes("IDENTITY")) {
      pushUnresolved(
        "developer-metadata",
        "mapping",
        upperCode,
        ["inventory.room-map"],
        "mapping-unresolved"
      );
    }
  }

  return {
    sheetRef,
    sheetTerms: [...STAGE_B_SHEET_TERMS],
    termBindings: [],
    unresolvedBindings
  };
}

function matchesDecisionToUnresolved(
  unresolved: UnresolvedBinding,
  decision: SavedBindingDecision,
  branch: BranchSelection,
  sheetRef: SheetRef | null,
  validTermIds: Set<string>
) {
  if (!sheetRef) return false;
  if (!validTermIds.has(decision.termId)) return false;
  if (normalizeKeyPart(decision.branch) !== normalizeKeyPart(branch)) return false;
  if (normalizeKeyPart(decision.sheetRef.spreadsheetId) !== normalizeKeyPart(sheetRef.spreadsheetId)) return false;
  if (normalizeKeyPart(decision.sheetRef.sheetName) !== normalizeKeyPart(sheetRef.sheetName)) return false;
  if (normalizeKeyPart(decision.anchorId) !== normalizeKeyPart(unresolved.anchorId)) return false;
  if (normalizeKeyPart(decision.rawHeader) !== normalizeKeyPart(unresolved.rawHeader)) return false;
  if (!unresolved.candidateTerms.includes(decision.termId)) return false;
  return true;
}

export function mergeBindingDraftWithSavedDecisions(
  generated: BindingDraftSnapshot,
  savedDecisions: SavedBindingDecision[],
  branch: BranchSelection
): BindingDraftSnapshot {
  if (!generated.sheetRef || savedDecisions.length === 0) {
    return generated;
  }

  const validTermIds = new Set(generated.sheetTerms.map((term) => term.termId));
  const termBindings: TermBinding[] = [];
  const unresolvedBindings: UnresolvedBinding[] = [];

  for (const unresolved of generated.unresolvedBindings) {
    const matchedDecision = savedDecisions.find((decision) =>
      matchesDecisionToUnresolved(unresolved, decision, branch, generated.sheetRef, validTermIds)
    );
    if (!matchedDecision) {
      unresolvedBindings.push(unresolved);
      continue;
    }
    termBindings.push({
      anchorId: matchedDecision.anchorId,
      termId: matchedDecision.termId,
      confidence: matchedDecision.confidence,
      method: "manual",
      decidedAt: matchedDecision.decidedAt,
      decisionKey: matchedDecision.decisionKey,
      rawHeader: matchedDecision.rawHeader
    });
  }

  return {
    sheetRef: generated.sheetRef,
    sheetTerms: generated.sheetTerms,
    termBindings,
    unresolvedBindings
  };
}
