import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

async function runVerify(args, env = {}) {
  const root = process.cwd();
  const result = await new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/app_v2_runtime_verify.mjs", ...args], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
  return result;
}

async function main() {
  const emptyUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "app-v2-verify-empty-"));
  const missingSettings = await runVerify(["--focus", "live-read", "--json", "--user-data-dir", emptyUserDataDir]);
  assert.equal(missingSettings.code, 1, `missing settings should fail\nstdout:\n${missingSettings.stdout}\nstderr:\n${missingSettings.stderr}`);
  const missingSettingsJson = JSON.parse(missingSettings.stdout);
  assert.equal(missingSettingsJson.focus, "live-read");
  assert.equal(missingSettingsJson.preflightStatus, "needs-settings");
  assert.equal(missingSettingsJson.overallReady, false);
  assert.deepEqual(missingSettingsJson.blockingSources, ["sheet"]);
  assert.equal(missingSettingsJson.sheet.status, "needs-settings");

  const configuredUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "app-v2-verify-configured-"));
  const disabledTokenFile = path.join(configuredUserDataDir, "missing-google-token.json");
  await fs.writeFile(
    path.join(configuredUserDataDir, "app-v2-settings.json"),
    `${JSON.stringify(
      {
        config: {
          spreadsheet: "https://docs.google.com/spreadsheets/d/1abcdefghijklmnopqrstuvwxyzABCDE1234567890/edit#gid=0",
          sheetName: "2026"
        },
        updatedAt: "2026-03-19T00:00:00.000Z"
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const missingAuth = await runVerify(
    ["--focus", "sheet-live", "--json", "--user-data-dir", configuredUserDataDir, "--google-token-file", disabledTokenFile],
    {
    GOOGLE_ACCESS_TOKEN: "",
    UHS_GOOGLE_ACCESS_TOKEN: "",
    GOOGLE_REFRESH_TOKEN: "",
    UHS_GOOGLE_REFRESH_TOKEN: "",
    GOOGLE_CLIENT_ID: "",
    UHS_GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    UHS_GOOGLE_CLIENT_SECRET: ""
  }
  );
  assert.equal(missingAuth.code, 1, `missing sheet auth should fail\nstdout:\n${missingAuth.stdout}\nstderr:\n${missingAuth.stderr}`);
  const missingAuthJson = JSON.parse(missingAuth.stdout);
  assert.equal(missingAuthJson.focus, "sheet-live");
  assert.equal(missingAuthJson.overallReady, false);
  assert.deepEqual(missingAuthJson.blockingSources, ["sheet-auth"]);
  assert.equal(missingAuthJson.sheet.status, "needs-auth");
  assert.match(missingAuthJson.sheet.summary, /(auth|인증)/i);

  console.log("regression_app_v2_runtime_verify: OK");
}

main();
