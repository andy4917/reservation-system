import fs from "node:fs";
import electron from "electron";
import type { AppLaunchContext } from "./appMode.js";
import { evaluateRuntimeReadiness } from "./runtimeReadiness.js";

const { app } = electron;

function writeVerificationResult(outputFile: string, payload: unknown) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (outputFile) {
    fs.writeFileSync(outputFile, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

export async function runRuntimeVerificationProcess(context: AppLaunchContext) {
  try {
    const result = await evaluateRuntimeReadiness(context.verifyFocus);
    writeVerificationResult(context.verifyOutputFile, result);
    app.exit(result.overallReady ? 0 : 1);
  } catch (error) {
    writeVerificationResult(context.verifyOutputFile, {
      checkedAt: new Date().toISOString(),
      focus: context.verifyFocus,
      preflightStatus: "attention",
      overallReady: false,
      blockingSources: ["runtime-error"],
      supportLevel: "offline-preview",
      v2Gate: "locked",
      sheet: {
        checkedAt: new Date().toISOString(),
        status: "error",
        summary: "Runtime verification failed with an unexpected exception.",
        spreadsheetId: null,
        sheetName: null,
        accessMode: "none",
        lastError: error instanceof Error ? error.message : String(error)
      },
      settings: {
        config: null,
        isConfigured: false,
        missingRequired: ["spreadsheet", "sheetName"],
        updatedAt: null,
        storagePath: context.userDataDirOverride
      },
      preflight: null
    });
    app.exit(1);
  }
}
