import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function buildLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

function ensureExtensionlessModuleCopies(baseDir) {
  const pending = [baseDir];
  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) continue;
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      const extensionlessPath = fullPath.slice(0, -3);
      if (fs.existsSync(extensionlessPath)) continue;
      fs.copyFileSync(fullPath, extensionlessPath);
    }
  }
}

function buildExportBundle({ status = "sent", repeated = false } = {}) {
  return {
    runId: "run-1",
    branch: "GANGNAM",
    generatedAt: "2026-03-17T12:00:00.000Z",
    sheetRef: {
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      sheetId: null,
      timezone: "Asia/Seoul"
    },
    dateRange: {
      startDate: "2026-03-12",
      endDate: "2026-03-12"
    },
    verifyEvidence: {
      source: "sheet-api",
      classification: "live-success",
      failureCategory: "none",
      failureDetail: "",
      summaryLines: ["verify ok"]
    },
    metrics: {
      sectionCount: 1,
      manualDecisionCount: 1,
      unresolvedCount: 1,
      latestAcceptedCount: 1,
      latestRejectedCount: 0,
      triagedCandidateCount: 1,
      triageCoverage: 0.5,
      supersededTraceCount: 0,
      traceCount: 1
    },
    sections: [
      {
        sectionKey: "GANGNAM",
        state: "active",
        bindingCount: 1,
        unresolvedCount: 1,
        latestAcceptedCount: 1,
        latestRejectedCount: 0
      }
    ],
    traces: [],
    manifest: {
      runId: "run-1",
      branch: "GANGNAM",
      generatedAt: "2026-03-17T12:00:00.000Z",
      source: "sheet-api",
      verifyClassification: "live-success",
      spreadsheetId: "spreadsheet-123",
      sheetName: "운영시트",
      startDate: "2026-03-12",
      endDate: "2026-03-12",
      sectionCount: 1,
      unresolvedCount: 1,
      triageCoverage: 0.5,
      traceCount: 1,
      latestAcceptedCount: 1,
      latestRejectedCount: 0
    },
    evidenceLineage: ["run:run-1"],
    operatorLoopLines: ["1. sample loop"],
    handoffHistory: [
      {
        handoffId: "handoff-1",
        runId: "run-1",
        branch: "GANGNAM",
        sheetRef: {
          spreadsheetId: "spreadsheet-123",
          sheetName: "운영시트",
          sheetId: null,
          timezone: "Asia/Seoul"
        },
        target: "clipboard",
        format: "copy-text",
        exportedAt: "2026-03-17T12:00:00.000Z",
        fileName: "operator-export.txt",
        filePath: null,
        bytes: 128,
        verifyClassification: "live-success",
        source: "sheet-api",
        startDate: "2026-03-12",
        endDate: "2026-03-12",
        evidenceLineage: ["run:run-1"],
        status,
        repeatedFromHandoffId: repeated ? "handoff-1" : null,
        payload: {
          format: "copy-text",
          fileName: "operator-export.txt",
          mimeType: "text/plain",
          content: "copy payload"
        }
      },
      ...(repeated
        ? [
            {
              handoffId: "handoff-2",
              runId: "run-1",
              branch: "GANGNAM",
              sheetRef: {
                spreadsheetId: "spreadsheet-123",
                sheetName: "운영시트",
                sheetId: null,
                timezone: "Asia/Seoul"
              },
              target: "clipboard",
              format: "copy-text",
              exportedAt: "2026-03-17T12:10:00.000Z",
              fileName: "operator-export.txt",
              filePath: null,
              bytes: 128,
              verifyClassification: "live-success",
              source: "sheet-api",
              startDate: "2026-03-12",
              endDate: "2026-03-12",
              evidenceLineage: ["run:run-1"],
              status: "sent",
              repeatedFromHandoffId: "handoff-1",
              payload: {
                format: "copy-text",
                fileName: "operator-export.txt",
                mimeType: "text/plain",
                content: "copy payload"
              }
            }
          ]
        : [])
    ],
    handoff: {
      copyText: "copy payload",
      files: []
    },
    previewLines: ["preview"]
  };
}

async function main() {
  const root = process.cwd();
  ensureExtensionlessModuleCopies(path.join(root, "dist-app"));
  let status = "sent";
  let repeated = false;
  const window = {
    localStorage: buildLocalStorage(),
    desktopBridge: {
      buildOperatorExport: async () => ({
        ok: true,
        exportBundle: buildExportBundle({ status, repeated })
      }),
      repeatOperatorHandoff: async () => {
        repeated = true;
        return {
          ok: true,
          repeated: true,
          handoff: buildExportBundle({ status, repeated }).handoffHistory[1],
          filePath: null
        };
      },
      updateOperatorHandoffStatus: async (_request) => {
        status = "confirmed";
        return {
          ok: true,
          handoff: buildExportBundle({ status, repeated }).handoffHistory[0]
        };
      }
    }
  };

  const modulePath = path.join(root, "dist-app/renderer/state/uiStore.js");
  globalThis.window = window;
  globalThis.localStorage = window.localStorage;
  const { useUiStore } = await import(`${pathToFileURL(modulePath).href}?ts=${Date.now()}`);
  useUiStore.setState((state) => ({
    ...state,
    selectedBranch: "GANGNAM",
    sheetRead: {
      ...state.sheetRead,
      selectedRunId: "run-1"
    }
  }));

  await useUiStore.getState().refreshOperatorExport();
  assert.equal(useUiStore.getState().operatorExport?.handoffHistory.length, 1);
  assert.equal(useUiStore.getState().handoffHistoryFilter, "all");
  useUiStore.getState().setHandoffHistoryFilter("needs-follow-up");
  assert.equal(useUiStore.getState().handoffHistoryFilter, "needs-follow-up");

  await useUiStore.getState().repeatOperatorHandoff("handoff-1", "clipboard");
  assert.equal(useUiStore.getState().operatorExport?.handoffHistory.length, 2);
  assert.match(useUiStore.getState().logs.join("\n"), /operator handoff repeat copied/);

  await useUiStore.getState().setOperatorHandoffStatus("handoff-1", "confirmed");
  assert.equal(useUiStore.getState().operatorExport?.handoffHistory[0]?.status, "confirmed");
  assert.match(useUiStore.getState().logs.join("\n"), /status updated/);

  console.log("regression_app_ui_store_handoff_actions: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
