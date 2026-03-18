import type { FetchSheetSnapshotSummary, OperatorExportVerifyClassification } from "../contracts/provider.js";

export function classifySheetVerifySummary(
  summary: FetchSheetSnapshotSummary | null,
  source: string,
  error: string
): OperatorExportVerifyClassification {
  const normalizedSource = String(source || "").trim().toLowerCase();
  if (normalizedSource === "sheet-unconfigured") return "sheet-unconfigured";
  if (summary && summary.failureCategory === "none" && !String(error || "").trim() && normalizedSource === "sheet-api") {
    return "live-success";
  }
  if (summary || String(error || "").trim() || normalizedSource) return "failure";
  return "unavailable";
}

export function formatSheetVerifySummary(
  summary: FetchSheetSnapshotSummary | null,
  source: string,
  error: string,
  branch: string
) {
  const mappingSections = [];
  if (Array.isArray(summary?.hintSummary?.branchSectionEvidence) && summary.hintSummary.branchSectionEvidence.length > 0) {
    mappingSections.push(`primary=${summary?.hintSummary?.branch || "-"}`);
  }
  return [
    `source=${source || "unknown"}`,
    `branch=${branch || summary?.hintSummary?.branch || "-"} sheet=${summary?.sheetName || "-"} (${summary?.spreadsheetId || "-"})`,
    `range=${summary?.startDate || "-"}..${summary?.endDate || "-"}`,
    `mode=${summary?.readMode || "-"} failure=${summary?.failureCategory || "-"}`,
    `sections=${mappingSections.join(" ") || "-"} manualAnchor=${summary?.anchorSummary?.manualAnchorUsed ? "yes" : "no"}`,
    `namedRange=${summary?.anchorSummary?.namedRangeCount ?? 0} metadata=${summary?.anchorSummary?.metadataCount ?? 0}`,
    `provider=${summary?.validationSummary?.providerKey || "-"} valueSource=${summary?.validationSummary?.providerValueSourceKind || "-"}:${summary?.validationSummary?.providerValueRow ?? "-"}`,
    `typedSlots=${summary?.validationSummary?.typedSlotComplete ? "complete" : "partial"} duplicate=${summary?.validationSummary?.typedSlotDuplicate ? "yes" : "no"}`,
    `providerDays=NAVER ${summary?.providerValueDays?.NAVER ?? 0} / STATION ${summary?.providerValueDays?.STATION ?? 0}`,
    `issues=${summary?.validationSummary?.issueCount ?? 0} warnings=${summary?.validationSummary?.warningCount ?? 0} errors=${summary?.validationSummary?.errorCount ?? 0}`,
    error ? `error=${error}` : null
  ].filter((line): line is string => Boolean(line));
}
