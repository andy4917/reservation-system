import type { SavedBindingDecision } from "../contracts/provider.js";
import type {
  BranchSelection,
  MappingArtifact,
  MappingAnchor,
  ProviderValueSource,
  SheetReadSnapshot,
  SheetRef,
  SectionRef,
  SheetTerm,
  StructuralVariant,
  TermBinding,
  UnresolvedBinding
} from "../renderer/types.js";

export interface BindingDraftSnapshot {
  sheetRef: SheetRef | null;
  sheetTerms: SheetTerm[];
  termBindings: TermBinding[];
  unresolvedBindings: UnresolvedBinding[];
  mappingArtifacts: MappingArtifact[];
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
  },
  {
    termId: "inventory.room-alias",
    canonicalName: "inventory.room-alias",
    synonyms: ["room alias", "room alias graph", "alias map"],
    datatype: "mapping",
    description: "Room alias canonicalization hints"
  },
  {
    termId: "reservation.identity",
    canonicalName: "reservation.identity",
    synonyms: ["reservation identity", "id normalization", "guest reservation id"],
    datatype: "validation",
    description: "Reservation identity harmonization signal"
  }
];

type MappingDomain = "inventory" | "provider" | "validation" | "mapping" | "reservation" | "anchor";
type MappingSeverity = "critical" | "high" | "medium" | "low";

type UnresolvedBindingEnhancement = {
  mappingDomain: MappingDomain;
  severity: MappingSeverity;
  confidence: number;
  evidenceSource: string;
  evidenceSignals: string[];
  ruleId: string;
};

type ExtendedUnresolvedBinding = UnresolvedBinding & UnresolvedBindingEnhancement;

type UnresolvedBindingInput = {
  kind: "named-range" | "developer-metadata" | "grid-hash";
  scope: string;
  rawHeader: string;
  candidateTerms: string[];
  reason: string;
  sampleValues?: string[];
  summary: NonNullable<SheetReadSnapshot["summary"]>;
};

type MappingArtifactMetrics = NonNullable<MappingArtifact["metrics"]>;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKeyPart(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function parseEvidenceRow(evidence: string[], prefix: string) {
  for (const entry of evidence) {
    const match = normalizeText(entry).match(new RegExp(`^${prefix}:(\\d+)$`, "i"));
    if (match) return Number(match[1]);
  }
  return null;
}

function buildRuleSignals(summary: NonNullable<SheetReadSnapshot["summary"]>, rawHeader: string, kind: string, scope: string) {
  const signals = [
    `kind:${kind}`,
    `scope:${scope}`,
    `provider:${normalizeText(summary.validationSummary.providerKey).toUpperCase() || "UNKNOWN"}`,
    `branch:${normalizeText(summary.hintSummary.branch) || "UNKNOWN"}`,
    `header:${normalizeText(rawHeader) || "EMPTY"}`
  ];
  if (normalizeText(summary.hintSummary.fingerprint)) {
    signals.push(`fingerprint:${normalizeText(summary.hintSummary.fingerprint)}`);
  }
  if (normalizeText(summary.hintSummary.scanMode)) {
    signals.push(`scan-mode:${normalizeText(summary.hintSummary.scanMode)}`);
  }
  return signals;
}

function buildUnresolvedMeta(input: UnresolvedBindingInput): UnresolvedBindingEnhancement {
  const normalizedReason = normalizeText(input.reason);
  const upperHeader = normalizeText(input.rawHeader).toUpperCase();

  if (normalizedReason === "room-map-missing") {
    return {
      mappingDomain: "mapping",
      severity: "high",
      confidence: 0.84,
      evidenceSource: "sheet-hint",
      evidenceSignals: buildRuleSignals(input.summary, input.rawHeader, input.kind, input.scope),
      ruleId: "rule:room-map-missing:v1"
    };
  }

  if (normalizedReason === "scan-config-anchor-missing") {
    return {
      mappingDomain: "mapping",
      severity: "medium",
      confidence: 0.75,
      evidenceSource: "sheet-scan-config",
      evidenceSignals: buildRuleSignals(input.summary, input.rawHeader, input.kind, input.scope),
      ruleId: "rule:scan-config-anchor-missing:v1"
    };
  }

  if (normalizedReason === "provider-value-row-missing") {
    return {
      mappingDomain: "provider",
      severity: "critical",
      confidence: 0.86,
      evidenceSource: "sheet-validation-summary",
      evidenceSignals: [
        ...buildRuleSignals(input.summary, input.rawHeader, input.kind, input.scope),
        `providerRow:${input.summary.validationSummary.providerRow ?? "null"}`,
        `providerValueRow:${input.summary.validationSummary.providerValueRow ?? "null"}`,
        `typedSlotComplete:${input.summary.validationSummary.typedSlotComplete ? "true" : "false"}`
      ],
      ruleId: "rule:provider-value-row-missing:v1"
    };
  }

  if (normalizedReason === "room-type-range-unresolved") {
    return {
      mappingDomain: "inventory",
      severity: "medium",
      confidence: 0.8,
      evidenceSource: "validation-issue",
      evidenceSignals: [
        ...buildRuleSignals(input.summary, input.rawHeader, input.kind, input.scope),
        `branchRows:${input.summary.reservationBlockCount ?? 0}`
      ],
      ruleId: "rule:room-type-range-unresolved:v1"
    };
  }

  if (normalizedReason === "mapping-unresolved") {
    if (upperHeader.includes("ALIAS")) {
      return {
        mappingDomain: "reservation",
        severity: "low",
        confidence: 0.5,
        evidenceSource: "validation-issue",
        evidenceSignals: [...buildRuleSignals(input.summary, input.rawHeader, input.kind, input.scope), "signal:alias-likelihood"],
        ruleId: "rule:mapping-unresolved-alias:v1"
      };
    }
    if (upperHeader.includes("IDENTITY")) {
      return {
        mappingDomain: "reservation",
        severity: "low",
        confidence: 0.5,
        evidenceSource: "validation-issue",
        evidenceSignals: [...buildRuleSignals(input.summary, input.rawHeader, input.kind, input.scope), "signal:identity-likelihood"],
        ruleId: "rule:mapping-unresolved-identity:v1"
      };
    }
    return {
      mappingDomain: "mapping",
      severity: "medium",
      confidence: 0.57,
      evidenceSource: "validation-issue",
      evidenceSignals: buildRuleSignals(input.summary, input.rawHeader, input.kind, input.scope),
      ruleId: "rule:mapping-unresolved-generic:v1"
    };
  }

  return {
    mappingDomain: "validation",
    severity: "low",
    confidence: 0.52,
    evidenceSource: "unknown",
    evidenceSignals: buildRuleSignals(input.summary, input.rawHeader, input.kind, input.scope),
    ruleId: "rule:generic-unresolved:v1"
  };
}

function buildUnresolvedBinding(summary: NonNullable<SheetReadSnapshot["summary"]>, input: UnresolvedBindingInput): ExtendedUnresolvedBinding {
  const base: ExtendedUnresolvedBinding = {
    anchorId: buildAnchorId({
      spreadsheetId: summary.spreadsheetId,
      sheetName: summary.sheetName,
      sheetId: null,
      branch: normalizeKeyPart(summary.hintSummary.branch),
      timezone: null
    }, input.kind, input.scope),
    rawHeader: input.rawHeader,
    sampleValues: [...(input.sampleValues ?? [])],
    candidateTerms: [...input.candidateTerms],
    reason: input.reason,
    status: "open",
    ...buildUnresolvedMeta(input)
  };
  return base;
}

function isMappingAnchorKind(value: string): value is MappingAnchor["kind"] {
  return (
    value === "dateRow" ||
    value === "roomStartRow" ||
    value === "inventorySearchStartRow" ||
    value === "stationInventoryRow" ||
    value === "naverInventoryRow"
  );
}

function buildSectionRef(summary: NonNullable<SheetReadSnapshot["summary"]>, sheetRef: SheetRef): SectionRef {
  const evidence = Array.isArray(summary.hintSummary.branchSectionEvidence) ? summary.hintSummary.branchSectionEvidence : [];
  const roomStartRow = parseEvidenceRow(evidence, "roomStartRow");
  const inventoryStartRow = parseEvidenceRow(evidence, "inventorySearchStartRow");
  return {
    spreadsheetId: sheetRef.spreadsheetId,
    sheetName: sheetRef.sheetName,
    sheetId: sheetRef.sheetId,
    sectionKey: normalizeText(summary.hintSummary.branch) || normalizeText(sheetRef.branch) || "UNKNOWN",
    titleRow: parseEvidenceRow(evidence, "titleRow"),
    headerRow: parseEvidenceRow(evidence, "headerRow"),
    state: Number.isInteger(roomStartRow) || Number.isInteger(inventoryStartRow) ? "active" : "preopen",
    roomStartRow,
    inventoryStartRow
  };
}

function buildSectionRefFromSnapshotSection(snapshotSection: Record<string, unknown>, sheetRef: SheetRef): SectionRef {
  const roomStartRow = Number.isInteger(snapshotSection.roomStartRow) ? Number(snapshotSection.roomStartRow) : null;
  const inventoryStartRow = Number.isInteger(snapshotSection.inventoryStartRow) ? Number(snapshotSection.inventoryStartRow) : null;
  return {
    spreadsheetId: sheetRef.spreadsheetId,
    sheetName: sheetRef.sheetName,
    sheetId: sheetRef.sheetId,
    sectionKey: normalizeText(snapshotSection.sectionKey) || normalizeText(sheetRef.branch) || "UNKNOWN",
    state: snapshotSection.state === "preopen" ? "preopen" : Number.isInteger(roomStartRow) || Number.isInteger(inventoryStartRow) ? "active" : "preopen",
    titleRow: Number.isInteger(snapshotSection.titleRow) ? Number(snapshotSection.titleRow) : null,
    headerRow: Number.isInteger(snapshotSection.headerRow) ? Number(snapshotSection.headerRow) : null,
    roomStartRow,
    inventoryStartRow
  };
}

function buildProviderValueSource(summary: NonNullable<SheetReadSnapshot["summary"]>): ProviderValueSource {
  return {
    providerKey: summary.validationSummary.providerKey,
    providerRow: summary.validationSummary.providerRow,
    providerValueRow: summary.validationSummary.providerValueRow,
    providerRowRole: summary.validationSummary.providerRowRole,
    sourceKind: summary.validationSummary.providerValueSourceKind,
    sourceReason: summary.validationSummary.providerValueSourceReason,
    typedSlotRows: { ...summary.validationSummary.typedSlotRows },
    typedSlotComplete: summary.validationSummary.typedSlotComplete,
    typedSlotDuplicate: summary.validationSummary.typedSlotDuplicate
  };
}

function createEmptyProviderValueSource(providerKey = ""): ProviderValueSource {
  return {
    providerKey,
    providerRow: null,
    providerValueRow: null,
    providerRowRole: "none",
    sourceKind: "none",
    sourceReason: "",
    typedSlotRows: {
      urban: null,
      doubleTwin: null,
      grand: null
    },
    typedSlotComplete: false,
    typedSlotDuplicate: false
  };
}

function buildStructuralSummary(summary: NonNullable<SheetReadSnapshot["summary"]>): StructuralVariant[] {
  const variants: StructuralVariant[] = [
    {
      kind: "physicalOrderVariant",
      value: summary.validationSummary.physicalOrderVariant,
      detail: "typed slot completeness와 별도로 physical row order variance를 구조 메타데이터로 유지"
    },
    {
      kind: "manualAnchorUsed",
      value: summary.anchorSummary.manualAnchorUsed,
      detail: summary.anchorSummary.manualAnchorFields.join(",")
    }
  ];
  if (summary.hintSummary.branchSectionEvidence.length > 0) {
    variants.push({
      kind: "branchSectionEvidence",
      value: summary.hintSummary.branch,
      detail: summary.hintSummary.branchSectionEvidence.join(" | ")
    });
  }
  return variants;
}

function buildStructuralSummaryForSection(summary: NonNullable<SheetReadSnapshot["summary"]>, section: SectionRef, evidence: string[] = [], isPrimary = false): StructuralVariant[] {
  const variants: StructuralVariant[] = [
    {
      kind: "branchSectionEvidence",
      value: section.sectionKey,
      detail: evidence.join(" | ")
    }
  ];
  if (isPrimary) {
    variants.push(...buildStructuralSummary(summary));
  }
  return variants;
}

function buildManualAnchors(summary: NonNullable<SheetReadSnapshot["summary"]>, sheetRef: SheetRef): MappingAnchor[] {
  const evidenceSignals = Array.isArray(summary.hintSummary.branchSectionEvidence) ? summary.hintSummary.branchSectionEvidence : [];
  return summary.anchorSummary.manualAnchorFields
    .filter(isMappingAnchorKind)
    .map((kind) => ({
      anchorId: `${sheetRef.spreadsheetId || "unknown"}:${sheetRef.sheetName || "unknown"}:${kind}`,
      kind,
      source: "manual",
      row: parseEvidenceRow(evidenceSignals, kind),
      confidence: 1,
      evidence: {
        why: "manual-anchor-field-present",
        competingCandidates: [],
        signals: evidenceSignals
      }
    }));
}

function buildManualAnchorsForSection(summary: NonNullable<SheetReadSnapshot["summary"]>, sheetRef: SheetRef, section: SectionRef): MappingAnchor[] {
  const evidenceSignals = Array.isArray(summary.hintSummary.branchSectionEvidence) ? summary.hintSummary.branchSectionEvidence : [];
  return summary.anchorSummary.manualAnchorFields
    .filter(isMappingAnchorKind)
    .map((kind) => ({
      anchorId: `${sheetRef.spreadsheetId || "unknown"}:${sheetRef.sheetName || "unknown"}:${section.sectionKey}:${kind}`,
      kind,
      source: "manual",
      row:
        kind === "dateRow"
          ? section.headerRow
          : kind === "roomStartRow"
            ? section.roomStartRow
            : kind === "inventorySearchStartRow"
              ? section.inventoryStartRow
              : parseEvidenceRow(evidenceSignals, kind),
      confidence: 1,
      evidence: {
        why: "section-segmentation-selected",
        competingCandidates: [],
        signals: evidenceSignals
      }
    }));
}

function buildMappingArtifactMetrics(input: Pick<MappingArtifact, "bindings" | "unresolved">): MappingArtifactMetrics {
  const unresolvedByDomain: MappingArtifactMetrics["unresolvedByDomain"] = {};
  for (const unresolved of input.unresolved) {
    const domain = unresolved.mappingDomain || "validation";
    unresolvedByDomain[domain] = (unresolvedByDomain[domain] || 0) + 1;
  }

  const confidenceValues = [
    ...input.bindings.map((binding) => Number(binding.confidence)),
    ...input.unresolved.map((unresolved) => Number(unresolved.confidence ?? 0))
  ].filter((value) => Number.isFinite(value));

  const confidenceBands = confidenceValues.reduce(
    (acc, value) => {
      if (value >= 0.8) acc.high += 1;
      else if (value >= 0.6) acc.medium += 1;
      else acc.low += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  const exactAutoBindingCount = input.bindings.filter(
    (binding) => binding.method !== "manual" && normalizeText(binding.resolvedCanonicalId)
  ).length;
  const roomAliasBindingCount = input.bindings.filter(
    (binding) => binding.termId === "inventory.room-alias" && normalizeText(binding.resolvedCanonicalId)
  ).length;
  const reservationIdentityBindingCount = input.bindings.filter(
    (binding) => binding.termId === "reservation.identity" && normalizeText(binding.resolvedCanonicalId)
  ).length;
  const softTriageCount = input.unresolved.filter((item) => item.reason === "reservation-identity-soft-match").length;
  const targetedUnresolvedCount = input.unresolved.filter((item) => {
    return (
      item.reason === "reservation-identity-soft-match" ||
      item.reason === "room-alias-ambiguous" ||
      item.candidateTerms.includes("inventory.room-alias") ||
      item.candidateTerms.includes("reservation.identity")
    );
  }).length;
  const precisionBase = exactAutoBindingCount + targetedUnresolvedCount;
  const precisionScore = precisionBase > 0 ? Number((exactAutoBindingCount / precisionBase).toFixed(3)) : 0;
  const precisionGate =
    precisionBase <= 0 ? "not-applicable" :
      targetedUnresolvedCount <= 0 ? "ready" :
        "needs-review";

  return {
    autoBindingCount: input.bindings.filter((binding) => binding.method !== "manual").length,
    manualBindingCount: input.bindings.filter((binding) => binding.method === "manual").length,
    unresolvedByDomain,
    exactAutoBindingCount,
    roomAliasBindingCount,
    reservationIdentityBindingCount,
    softTriageCount,
    targetedUnresolvedCount,
    precisionScore,
    precisionGate,
    confidenceBands
  };
}

function attachArtifactMetrics<T extends MappingArtifact>(artifact: T): T {
  return {
    ...artifact,
    metrics: buildMappingArtifactMetrics(artifact)
  };
}

function cloneMappingArtifacts(mappingArtifacts: MappingArtifact[]) {
  return mappingArtifacts.map((artifact) =>
    attachArtifactMetrics({
      ...artifact,
      section: { ...artifact.section },
      anchors: artifact.anchors.map((anchor) => ({
        ...anchor,
        evidence: {
          ...anchor.evidence,
          competingCandidates: [...anchor.evidence.competingCandidates],
          signals: [...anchor.evidence.signals]
        }
      })),
      bindings: artifact.bindings.map((binding) => ({
        ...binding,
        resolvedCanonicalId: binding.resolvedCanonicalId ?? null,
        evidenceSignals: Array.isArray(binding.evidenceSignals) ? [...binding.evidenceSignals] : undefined,
        evidenceLineage: Array.isArray(binding.evidenceLineage) ? [...binding.evidenceLineage] : undefined
      })),
      unresolved: artifact.unresolved.map((binding) => ({
        ...binding,
        sampleValues: [...binding.sampleValues],
        candidateTerms: [...binding.candidateTerms],
        evidenceSignals: Array.isArray(binding.evidenceSignals) ? [...binding.evidenceSignals] : undefined
      })),
      providerValueSource: {
        ...artifact.providerValueSource,
        typedSlotRows: { ...artifact.providerValueSource.typedSlotRows }
      },
      structuralSummary: artifact.structuralSummary.map((variant) => ({ ...variant })),
      validationSummary: {
        ...artifact.validationSummary,
        issueCodes: [...artifact.validationSummary.issueCodes],
        typedSlotRows: { ...artifact.validationSummary.typedSlotRows }
      },
      truthSignals: Array.isArray(artifact.truthSignals)
        ? artifact.truthSignals.map((signal) => ({ ...signal, signals: [...signal.signals] }))
        : undefined
    })
  );
}

export function refreshMappingArtifactsMetrics(mappingArtifacts: MappingArtifact[]) {
  return cloneMappingArtifacts(mappingArtifacts);
}

function createEmptyValidationSummary(providerKey = ""): NonNullable<SheetReadSnapshot["summary"]>["validationSummary"] {
  return {
    providerKey,
    issueCount: 0,
    errorCount: 0,
    warningCount: 0,
    issueCodes: [],
    hasTypeMismatch: false,
    hasPartitionMismatch: false,
    hasInsufficientRows: false,
    providerValueRawCount: 0,
    providerValueParsedCount: 0,
    providerRow: null,
    providerValueRow: null,
    providerRowRole: "none",
    providerValueSourceKind: "none",
    providerValueSourceReason: "",
    typedSlotRows: {
      urban: null,
      doubleTwin: null,
      grand: null
    },
    typedSlotComplete: false,
    typedSlotDuplicate: false,
    physicalOrderVariant: false
  };
}

function flattenTermBindings(mappingArtifacts: MappingArtifact[]) {
  return mappingArtifacts.flatMap((artifact) => artifact.bindings);
}

function flattenUnresolvedBindings(mappingArtifacts: MappingArtifact[]) {
  return mappingArtifacts.flatMap((artifact) => artifact.unresolved);
}

export function buildSheetRef(summary: SheetReadSnapshot["summary"], branch: string): SheetRef | null {
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

function buildSectionScopedAnchorId(sheetRef: SheetRef, sectionKey: string, kind: string, scope: string) {
  return `${sheetRef.spreadsheetId || "unknown"}:${sheetRef.sheetName || "unknown"}:${sectionKey || "UNKNOWN"}:${kind}:${scope}`;
}

function scopeUnresolvedBindingsForSection(unresolvedBindings: UnresolvedBinding[], sheetRef: SheetRef, section: SectionRef) {
  return unresolvedBindings.map((item) => {
    const parts = normalizeText(item.anchorId).split(":");
    const kind = parts.length >= 3 ? parts[2] : "grid-hash";
    const scope = parts.slice(3).join(":");
    return {
      ...item,
      anchorId: buildSectionScopedAnchorId(sheetRef, section.sectionKey, kind, scope),
      sampleValues: [...item.sampleValues],
      candidateTerms: [...item.candidateTerms]
    };
  });
}

function toLegacyAnchorId(anchorId: string, sheetRef: SheetRef, sectionKey: string) {
  const prefix = `${sheetRef.spreadsheetId || "unknown"}:${sheetRef.sheetName || "unknown"}:${sectionKey}:`;
  if (!normalizeText(anchorId).startsWith(prefix)) return anchorId;
  return `${sheetRef.spreadsheetId || "unknown"}:${sheetRef.sheetName || "unknown"}:${anchorId.slice(prefix.length)}`;
}

function sortSavedDecisions(savedDecisions: SavedBindingDecision[]) {
  return [...savedDecisions].sort((left, right) => {
    const decidedAtCompare = normalizeText(left.decidedAt).localeCompare(normalizeText(right.decidedAt));
    if (decidedAtCompare !== 0) return decidedAtCompare;
    return normalizeText(left.decisionKey).localeCompare(normalizeText(right.decisionKey));
  });
}

export function buildGeneratedBindingDraftFromSummary(
  summary: SheetReadSnapshot["summary"],
  branch: string,
  runId: string | null = null
): BindingDraftSnapshot {
  const sheetRef = buildSheetRef(summary, branch);
  if (!summary || !sheetRef) {
    return {
      sheetRef,
      sheetTerms: [...STAGE_B_SHEET_TERMS],
      termBindings: [],
      unresolvedBindings: [],
      mappingArtifacts: []
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
    const resolvedSampleValues = [
      ...sampleValues.filter(Boolean),
      `domain:${reason.includes("room-type-range") || reason.includes("mapping") ? "inventory" : reason.includes("provider-value") ? "provider" : "mapping"}`,
      `scope:${scope}`,
      `run:${runId || "manual"}`
    ];
    const newUnresolved = buildUnresolvedBinding(summary, {
      kind,
      scope,
      rawHeader,
      candidateTerms,
      reason,
      sampleValues: resolvedSampleValues,
      summary
    });
    unresolvedBindings.push(newUnresolved);
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
      const unresolvedCandidateTerms =
        upperCode.includes("ALIAS") ? ["inventory.room-alias"] :
          upperCode.includes("IDENTITY") ? ["reservation.identity"] :
            ["inventory.room-map"];
      pushUnresolved(
        "developer-metadata",
        "mapping",
        upperCode,
        unresolvedCandidateTerms,
        "mapping-unresolved"
      );
    }
  }

  const mappingArtifacts: MappingArtifact[] = [
    attachArtifactMetrics({
      runId,
      section: buildSectionRef(summary, sheetRef),
      anchors: buildManualAnchors(summary, sheetRef),
      bindings: [],
      unresolved: unresolvedBindings,
      providerValueSource: buildProviderValueSource(summary),
      structuralSummary: buildStructuralSummary(summary),
      validationSummary: summary.validationSummary
    })
  ];

  return {
    sheetRef,
    sheetTerms: [...STAGE_B_SHEET_TERMS],
    termBindings: flattenTermBindings(mappingArtifacts),
    unresolvedBindings: flattenUnresolvedBindings(mappingArtifacts),
    mappingArtifacts
  };
}

export function buildGeneratedBindingDraft(sheetRead: SheetReadSnapshot, branch: BranchSelection): BindingDraftSnapshot {
  if (Array.isArray(sheetRead.mappingArtifacts) && sheetRead.mappingArtifacts.length > 0) {
    const mappingArtifacts = cloneMappingArtifacts(sheetRead.mappingArtifacts);
    return {
      sheetRef: buildSheetRef(sheetRead.summary, branch),
      sheetTerms: [...STAGE_B_SHEET_TERMS],
      termBindings: flattenTermBindings(mappingArtifacts),
      unresolvedBindings: flattenUnresolvedBindings(mappingArtifacts),
      mappingArtifacts
    };
  }
  return buildGeneratedBindingDraftFromSummary(sheetRead.summary, branch, sheetRead.selectedRunId);
}

export function buildGeneratedBindingDraftFromSnapshot(
  snapshot: Record<string, unknown> | null,
  summary: SheetReadSnapshot["summary"],
  branch: string,
  runId: string | null = null
): BindingDraftSnapshot {
  const fallback = buildGeneratedBindingDraftFromSummary(summary, branch, runId);
  const sheetRef = fallback.sheetRef;
  if (!snapshot || !sheetRef || !summary) return fallback;
  const scan = snapshot.scan && typeof snapshot.scan === "object" ? snapshot.scan as Record<string, unknown> : null;
  const rawSections = Array.isArray(scan?.sections) ? scan.sections.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  if (rawSections.length === 0) return fallback;

  const primarySectionKey = normalizeText(summary.hintSummary.branch) || normalizeText(branch);
  const primaryUnresolved = [...fallback.unresolvedBindings];
  const mappingArtifacts = rawSections.map((rawSection) => {
    const section = buildSectionRefFromSnapshotSection(rawSection, sheetRef);
    const evidence = Array.isArray(rawSection.evidence) ? rawSection.evidence.filter((entry): entry is string => typeof entry === "string") : [];
    const isPrimary =
      normalizeKeyPart(section.sectionKey) === normalizeKeyPart(primarySectionKey) ||
      normalizeKeyPart(section.sectionKey) === normalizeKeyPart(sheetRef.branch || "");
    return attachArtifactMetrics({
      runId,
      section,
      anchors: isPrimary ? buildManualAnchorsForSection(summary, sheetRef, section) : [],
      bindings: [],
      unresolved: isPrimary ? scopeUnresolvedBindingsForSection(primaryUnresolved, sheetRef, section) : [],
      providerValueSource: isPrimary ? buildProviderValueSource(summary) : createEmptyProviderValueSource(section.sectionKey),
      structuralSummary: buildStructuralSummaryForSection(summary, section, evidence, isPrimary),
      validationSummary: isPrimary ? summary.validationSummary : createEmptyValidationSummary(section.sectionKey)
    } satisfies MappingArtifact);
  });

  return {
    sheetRef,
    sheetTerms: [...STAGE_B_SHEET_TERMS],
    termBindings: flattenTermBindings(mappingArtifacts),
    unresolvedBindings: flattenUnresolvedBindings(mappingArtifacts),
    mappingArtifacts
  };
}

function matchesDecisionToUnresolved(
  unresolved: UnresolvedBinding,
  decision: SavedBindingDecision,
  branch: string,
  sheetRef: SheetRef | null,
  validTermIds: Set<string>,
  artifactSectionKey: string
) {
  if (!sheetRef) return false;
  if (!validTermIds.has(decision.termId)) return false;
  if (normalizeKeyPart(decision.branch) !== normalizeKeyPart(branch)) return false;
  if (normalizeKeyPart(decision.sheetRef.spreadsheetId) !== normalizeKeyPart(sheetRef.spreadsheetId)) return false;
  if (normalizeKeyPart(decision.sheetRef.sheetName) !== normalizeKeyPart(sheetRef.sheetName)) return false;
  if (normalizeText(decision.sectionKey) && normalizeKeyPart(decision.sectionKey) !== normalizeKeyPart(artifactSectionKey)) return false;
  const decisionAnchor = normalizeKeyPart(decision.anchorId);
  const unresolvedAnchor = normalizeKeyPart(unresolved.anchorId);
  const legacyAnchor = normalizeKeyPart(toLegacyAnchorId(unresolved.anchorId, sheetRef, artifactSectionKey));
  if (decisionAnchor !== unresolvedAnchor && decisionAnchor !== legacyAnchor) return false;
  if (normalizeKeyPart(decision.rawHeader) !== normalizeKeyPart(unresolved.rawHeader)) return false;
  if (!unresolved.candidateTerms.includes(decision.termId)) return false;
  return true;
}

export function mergeBindingDraftWithSavedDecisions(
  generated: BindingDraftSnapshot,
  savedDecisions: SavedBindingDecision[],
  branch: string
): BindingDraftSnapshot {
  if (!generated.sheetRef || savedDecisions.length === 0) {
    return generated;
  }

  const validTermIds = new Set(generated.sheetTerms.map((term) => term.termId));
  const orderedDecisions = sortSavedDecisions(savedDecisions);
  const mappingArtifacts = generated.mappingArtifacts
    .map((artifact) => {
    const nextBindings = [...artifact.bindings];
    const nextUnresolved: UnresolvedBinding[] = [];

    for (const unresolved of artifact.unresolved) {
      const matchedDecision = orderedDecisions.find((decision) =>
        matchesDecisionToUnresolved(unresolved, decision, branch, generated.sheetRef, validTermIds, artifact.section.sectionKey)
      );
      if (!matchedDecision) {
        nextUnresolved.push(unresolved);
        continue;
      }
      nextBindings.push({
        anchorId: matchedDecision.anchorId,
        termId: matchedDecision.termId,
        confidence: matchedDecision.confidence,
        method: "manual",
        decidedAt: matchedDecision.decidedAt,
        decisionKey: matchedDecision.decisionKey,
        rawHeader: matchedDecision.rawHeader
      });
    }

    return attachArtifactMetrics({
      ...artifact,
      bindings: nextBindings,
      unresolved: nextUnresolved
    });
  });

  return {
    sheetRef: generated.sheetRef,
    sheetTerms: generated.sheetTerms,
    termBindings: flattenTermBindings(mappingArtifacts),
    unresolvedBindings: flattenUnresolvedBindings(mappingArtifacts),
    mappingArtifacts
  };
}
