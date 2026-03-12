import assert from "node:assert/strict";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const recommendationLayer = await import(path.join(root, "dist-app/services/recommendationLayer.js"));

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
    logs: ["Inventory compare loaded for Bridge live rows.", "Rows prepared: 4"],
    evidenceLines: [
      "2026-03-12 Urban NAVER 4/6 vs 6/6",
      "2026-03-13 BRANCH_THE_SEOLLEUNG 6인 객실명 미정 STATION",
      "2026-03-13 Urban STATION 4/6 vs 6/6"
    ],
    opsLines: ["Bridge contract path: bridge.getContext -> provider.fetchRows -> provider.domSnapshot"],
    validationLines: ["Validation gate: mismatch rows remain, apply blocked"],
    inventoryCompareLoading: false,
    searchQuery: "",
    searchResults: [],
    processModules: [],
    providerCards: [],
    jobStatusCards: [],
    bridgeSummary: {
      authSummary: {
        cookieCount: 2,
        domains: ["partner.booking.naver.com"],
        hasBearer: false,
        hasCsrf: true,
        hasRole: false
      },
      infoSummary: {
        count: 4,
        channels: ["NAVER", "STATION"],
        dates: ["2026-03-12", "2026-03-13"]
      }
    },
    authBundleSettingsSnapshot: null,
    recommendationSettings: {
      enabled: true,
      modelId: "intfloat/multilingual-e5-small",
      runtimePreference: "transformers-js-local",
      localModelPath: "",
      cacheDir: "",
      scoreThreshold: 0.58
    },
    recommendationRuntime: null,
    recommendationAssist: {
      enabled: true,
      summary: "",
      recommendations: [],
      mismatchGroups: []
    },
    inventoryCompare: {
      title: "Inventory Compare",
      supportLevel: "read-live",
      sourceLabel: "Bridge live rows",
      lastRunAt: "2026-03-10T08:00:00.000Z",
      mismatchCount: 2,
      warningCount: 1,
      matchedCount: 1,
      rows: [
        {
          id: "row-1",
          date: "2026-03-12",
          roomType: "Urban Spa Suite 6인",
          channel: "NAVER",
          siteRaw: "4/6",
          sheetRaw: "6/6",
          diff: "-2",
          status: "mismatch",
          reason: "raw row and derived row disagree",
          action: "compare provider row vs value row"
        },
        {
          id: "row-2",
          date: "2026-03-13",
          branch: "BRANCH_THE_SEOLLEUNG",
          roomType: "6인 객실명 미정",
          channel: "STATION",
          siteRaw: "6인 객실명 미정",
          sheetRaw: "Urban Spa Suite 6인 / Double Twin Spa Room 4인",
          diff: "mapping",
          status: "mismatch",
          reason: "unknown room label needs mapping review",
          action: "mapping alias review"
        },
        {
          id: "row-3",
          date: "2026-03-13",
          roomType: "Grand",
          channel: "STATION",
          siteRaw: "closed",
          sheetRaw: "0/1",
          diff: "warn",
          status: "warning",
          reason: "provider closed text parsed via fallback",
          action: "require dom snapshot on live bridge"
        },
        {
          id: "row-4",
          date: "2026-03-13",
          branch: "BRANCH_THE_SEOLLEUNG",
          roomType: "Double Twin Spa Room 4인",
          channel: "STATION",
          siteRaw: "2/2",
          sheetRaw: "2/2",
          diff: "0",
          status: "match",
          reason: "sheet and provider aligned",
          action: "keep"
        }
      ],
      evidenceLines: [],
      opsLines: [],
      validationLines: [],
      logs: []
    }
  };

  const assist = await recommendationLayer.buildRecommendationAssist(state, { enabled: true, settings: state.recommendationSettings });
  assert.equal(assist.enabled, true);
  assert.equal(assist.recommendations.length > 0, true);
  assert.equal(assist.mismatchGroups.some((group) => group.id === "mapping-drift"), true);
  assert.equal(assist.mismatchGroups.some((group) => group.id === "dom-drift"), true);
  assert.equal(typeof assist.recommendations[0].candidates[0].score, "number");
  assert.equal(state.inventoryCompare.mismatchCount, 2);
  assert.equal(state.inventoryCompare.rows[0].roomType, "Urban Spa Suite 6인");
  const branchMapping = assist.recommendations.find((item) => item.input.source === "row-2");
  assert.ok(branchMapping, "branch-aware mapping recommendation should exist");
  assert.deepEqual(
    [...branchMapping.candidates.slice(0, 2).map((candidate) => candidate.value)].sort(),
    ["Double Twin Spa Room 4인", "Urban Spa Suite 6인"]
  );
  assert.equal(branchMapping.candidates[0].score >= 0.78, true);

  const disabledAssist = await recommendationLayer.buildRecommendationAssist(state, { enabled: false, settings: state.recommendationSettings });
  assert.deepEqual(disabledAssist.recommendations, []);
  assert.equal(disabledAssist.enabled, false);

  console.log("regression_app_recommendation_layer: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
