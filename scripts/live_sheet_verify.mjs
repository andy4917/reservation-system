import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const options = {
    startDate: "",
    endDate: "",
    branch: "",
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === "--start-date" && next) {
      options.startDate = next;
      index += 1;
      continue;
    }
    if (token === "--end-date" && next) {
      options.endDate = next;
      index += 1;
      continue;
    }
    if (token === "--branch" && next) {
      options.branch = next;
      index += 1;
      continue;
    }
    if (token === "--json") {
      options.json = true;
    }
  }

  return options;
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatSummary(summary, source, error) {
  const mappingSections = [];
  if (Array.isArray(summary?.hintSummary?.branchSectionEvidence) && summary.hintSummary.branchSectionEvidence.length > 0) {
    mappingSections.push(`primary=${summary.hintSummary.branch || "-"}`);
  }
  return [
    `source=${source || "unknown"}`,
    `sheet=${summary?.sheetName || "-"} (${summary?.spreadsheetId || "-"})`,
    `range=${summary?.startDate || "-"}..${summary?.endDate || "-"}`,
    `mode=${summary?.readMode || "-"} failure=${summary?.failureCategory || "-"}`,
    `branch=${summary?.hintSummary?.branch || "-"} sections=${mappingSections.join(" ") || "-"}`,
    `manualAnchor=${summary?.anchorSummary?.manualAnchorUsed ? "yes" : "no"} namedRange=${summary?.anchorSummary?.namedRangeCount ?? 0} metadata=${summary?.anchorSummary?.metadataCount ?? 0}`,
    `provider=${summary?.validationSummary?.providerKey || "-"} valueSource=${summary?.validationSummary?.providerValueSourceKind || "-"}:${summary?.validationSummary?.providerValueRow ?? "-"}`,
    `typedSlots=${summary?.validationSummary?.typedSlotComplete ? "complete" : "partial"} duplicate=${summary?.validationSummary?.typedSlotDuplicate ? "yes" : "no"}`,
    `providerDays=NAVER ${summary?.providerValueDays?.NAVER ?? 0} / STATION ${summary?.providerValueDays?.STATION ?? 0}`,
    `issues=${summary?.validationSummary?.issueCount ?? 0} warnings=${summary?.validationSummary?.warningCount ?? 0} errors=${summary?.validationSummary?.errorCount ?? 0}`,
    error ? `error=${error}` : null
  ].filter(Boolean);
}

async function main() {
  const root = process.cwd();
  const options = parseArgs(process.argv.slice(2));
  const startDate = options.startDate || process.env.UHS_VERIFY_START_DATE || todayDateKey();
  const endDate = options.endDate || process.env.UHS_VERIFY_END_DATE || startDate;
  const branch = options.branch || process.env.UHS_VERIFY_BRANCH || "GANGNAM";

  const runtimeModuleUrl = pathToFileURL(path.join(root, "dist-app/main/sheetRuntime.js")).href;
  const sheetRuntime = await import(`${runtimeModuleUrl}?t=${Date.now()}`);

  const result = await sheetRuntime.fetchSheetSnapshot({
    startDate,
    endDate,
    branch
  });

  const payload = {
    ok: true,
    source: result.source || "unknown",
    error: result.error || "",
    summary: result.summary,
    branch
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  for (const line of formatSummary(result.summary, result.source, result.error)) {
    console.log(line);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
