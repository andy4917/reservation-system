import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const runtimeModulePath = path.join(root, "dist-app/main/wingsRuntime.js");
const runtime = await import(`${pathToFileURL(runtimeModulePath).href}?t=${Date.now()}`);

const today = new Date().toISOString().slice(0, 10);
const startDate = process.env.UHS_WINGS_DRYRUN_START_DATE?.trim() || today;
const endDate = process.env.UHS_WINGS_DRYRUN_END_DATE?.trim() || startDate;

runtime.__resetWingsRuntimeForTests();

const diagnostics = runtime.getWingsRuntimeDiagnostics();
if (diagnostics.errors.length > 0) {
  console.error(JSON.stringify({ ok: false, stage: "diagnostics", diagnostics }, null, 2));
  process.exit(1);
}

const reservations = await runtime.fetchWingsReservations({ startDate, endDate });
const sourceCatalog = await runtime.fetchWingsLiveContract({ capability: "source_catalog" });

const summary = {
  ok: true,
  range: { startDate, endDate },
  diagnosticsBefore: diagnostics,
  diagnosticsAfter: runtime.getWingsRuntimeDiagnostics(),
  reservations: {
    source: reservations.source,
    endpointCapability: reservations.endpointCapability,
    recordCount: Array.isArray(reservations.records) ? reservations.records.length : 0,
    branches: Array.isArray(reservations.records)
      ? Array.from(new Set(reservations.records.map((row) => row.branch).filter(Boolean))).sort()
      : [],
    profilesFetched: reservations.profilesFetched || []
  },
  sourceCatalog: {
    source: sourceCatalog.source,
    endpointCapability: sourceCatalog.endpointCapability,
    itemCount: Array.isArray(sourceCatalog.items) ? sourceCatalog.items.length : 0,
    branches: Array.isArray(sourceCatalog.items)
      ? Array.from(new Set(sourceCatalog.items.map((row) => row.branch).filter(Boolean))).sort()
      : [],
    profilesFetched: sourceCatalog.profilesFetched || []
  }
};

console.log(JSON.stringify(summary, null, 2));
