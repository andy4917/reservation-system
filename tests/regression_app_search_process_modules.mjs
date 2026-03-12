import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const searchEngine = await import(path.join(root, "dist-app/services/searchEngine.js"));
  const processModules = await import(path.join(root, "dist-app/services/processModules.js"));

  const state = {
    runtimeMode: "live",
    activeTask: "inventory-compare",
    selectedRange: { startDate: "2026-03-12", endDate: "2026-03-15" },
    bridgeStatus: {
      connected: true,
      sessionAvailable: true,
      activeHost: "partner.booking.naver.com",
      provider: "naver-partner",
      message: "connected"
    },
    metrics: [],
    logs: ["Bridge context detected: naver-partner @ partner.booking.naver.com"],
    evidenceLines: ["Mismatch evidence: Urban 03-13 site=4 / sheet=6"],
    opsLines: ["Bridge contract path: bridge.getContext -> provider.fetchRows -> provider.domSnapshot"],
    validationLines: ["Validation gate: mismatch rows remain, apply blocked"],
    inventoryCompareLoading: false,
    searchQuery: "",
    searchResults: [],
    processModules: [],
    inventoryCompare: {
      title: "Inventory Compare",
      supportLevel: "read-live",
      sourceLabel: "Bridge live rows",
      lastRunAt: "2026-03-10T08:00:00.000Z",
      mismatchCount: 1,
      warningCount: 0,
      matchedCount: 0,
      rows: [
        {
          id: "row-1",
          date: "2026-03-13",
          roomType: "Urban",
          channel: "NAVER",
          siteRaw: "4/6",
          sheetRaw: "6/6",
          diff: "-2",
          status: "mismatch",
          reason: "site lagging",
          action: "review"
        }
      ],
      evidenceLines: [],
      opsLines: [],
      validationLines: [],
      logs: []
    }
  };

  const results = searchEngine.runWorkspaceSearch(state, "urban");
  assert.equal(results.length > 0, true);
  assert.equal(results[0].kind, "inventory-row");

  const modules = processModules.buildProcessModules(state);
  assert.equal(modules.some((item) => item.id === "search-engine" && item.owner === "app"), true);
  assert.equal(modules.some((item) => item.id === "session-auth" && item.status === "active"), true);

  console.log("regression_app_search_process_modules: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
