import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

function makeResponse(payload) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
    json: async () => payload
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const root = process.cwd();
  const build = spawnSync("npm", ["run", "app:build:main"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, `app:build:main should succeed\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`);

  const previousEnv = {
    token: process.env.UHS_GOOGLE_ACCESS_TOKEN
  };
  const previousFetch = globalThis.fetch;

  let attempts = 0;
  let lastUrl = null;
  const observedCallCount = [];
  const modulePath = path.join(root, "dist-app", "app_v2", "main", "sheetReadiness.js");

  try {
    process.env.UHS_GOOGLE_ACCESS_TOKEN = "token-otest";
    globalThis.fetch = async (url) => {
      attempts += 1;
      observedCallCount.push(String(url));
      lastUrl = String(url);
      if (attempts === 1) {
        await sleep(10);
        const aborted = new DOMException("This operation was aborted", "AbortError");
        throw aborted;
      }
      return makeResponse({
        sheets: [{ properties: { title: "Test Sheet" } }]
      });
    };

    const { evaluateSheetReadiness } = await import(modulePath);
    const result = await evaluateSheetReadiness({
      isConfigured: true,
      config: {
        spreadsheet: "https://docs.google.com/spreadsheets/d/1VnQj4b9LxvW7Wk1Qn6vG9xJ8R2h3F6kL9tN2bA5cY7zM/edit",
        sheetName: "Test Sheet",
        sheetTabs: null,
        opsView: null,
        reportWindowDays: 180
      },
      missingRequired: [],
      updatedAt: "2026-03-23T00:00:00.000Z",
      storagePath: "/tmp"
    });

    assert.equal(result.status, "ready");
    assert.equal(result.lastError, null);
    assert.equal(attempts, 2, "sheet-readiness metadata fetch should retry once on transient AbortError");
    assert.ok(
      lastUrl.includes("https://sheets.googleapis.com/v4/spreadsheets/1VnQj4b9LxvW7Wk1Qn6vG9xJ8R2h3F6kL9tN2bA5cY7zM?fields=sheets.properties.title"),
      "sheet metadata endpoint should be called"
    );

    if (observedCallCount.length > 0) {
      console.log(
        `regression_app_v2_sheet_readiness_retry: OK (calls=${observedCallCount.length}, first-url=${observedCallCount[0]})`
      );
    } else {
      console.log("regression_app_v2_sheet_readiness_retry: OK");
    }
  } finally {
    if (previousEnv.token === undefined) {
      delete process.env.UHS_GOOGLE_ACCESS_TOKEN;
    } else {
      process.env.UHS_GOOGLE_ACCESS_TOKEN = previousEnv.token;
    }
    globalThis.fetch = previousFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
