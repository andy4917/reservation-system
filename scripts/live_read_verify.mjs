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

async function main() {
  const root = process.cwd();
  const options = parseArgs(process.argv.slice(2));
  const startDate = options.startDate || process.env.UHS_VERIFY_START_DATE || todayDateKey();
  const endDate = options.endDate || process.env.UHS_VERIFY_END_DATE || startDate;
  const branch = options.branch || process.env.UHS_VERIFY_BRANCH || "GANGNAM";

  const runtimeModuleUrl = pathToFileURL(path.join(root, "dist-app/main/liveReadRuntime.js")).href;
  const liveReadRuntime = await import(`${runtimeModuleUrl}?t=${Date.now()}`);
  const bundle = await liveReadRuntime.fetchLiveReadBundle({
    runId: `verify:${Date.now()}`,
    branch,
    startDate,
    endDate
  });

  const payload = {
    ok: true,
    runId: bundle.runId,
    branch,
    startDate,
    endDate,
    readOnly: bundle.readOnly,
    bundleSupportLevel: bundle.bundleSupportLevel,
    sheet: {
      source: bundle.sheet.source,
      supportLevel: bundle.sheet.supportLevel,
      error: bundle.sheet.error,
      failureCategory: bundle.sheet.summary?.failureCategory || "none",
      validationIssueCount: bundle.sheet.summary?.validationIssueCount || 0
    },
    providers: {
      naverPartner: {
        source: bundle.providerRows["naver-partner"].source,
        supportLevel: bundle.providerRows["naver-partner"].supportLevel,
        rows: bundle.providerRows["naver-partner"].rows.length
      },
      adminStation: {
        source: bundle.providerRows["admin-station"].source,
        supportLevel: bundle.providerRows["admin-station"].supportLevel,
        rows: bundle.providerRows["admin-station"].rows.length
      }
    },
    wings: {
      source: bundle.wingsReservations.source,
      supportLevel: bundle.wingsReservations.supportLevel,
      rows: bundle.wingsReservations.rows.length,
      endpointCapability: bundle.wingsReservations.endpointCapability
    }
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`runId=${payload.runId} branch=${branch} window=${startDate}..${endDate} readOnly=${payload.readOnly ? "yes" : "no"}`);
  console.log(`bundleSupport=${payload.bundleSupportLevel}`);
  console.log(
    `sheet source=${payload.sheet.source || "-"} support=${payload.sheet.supportLevel} failure=${payload.sheet.failureCategory} issues=${payload.sheet.validationIssueCount}`
  );
  console.log(
    `naver source=${payload.providers.naverPartner.source || "-"} support=${payload.providers.naverPartner.supportLevel} rows=${payload.providers.naverPartner.rows}`
  );
  console.log(
    `station source=${payload.providers.adminStation.source || "-"} support=${payload.providers.adminStation.supportLevel} rows=${payload.providers.adminStation.rows}`
  );
  console.log(
    `wings source=${payload.wings.source || "-"} support=${payload.wings.supportLevel} rows=${payload.wings.rows} endpoint=${payload.wings.endpointCapability || "-"}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
