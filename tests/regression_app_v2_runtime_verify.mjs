import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

async function runVerify(args, env = {}, options = {}) {
  const root = options.cwd || process.cwd();
  const scriptPath = options.scriptPath || path.join(root, "scripts", "app_v2_runtime_verify.mjs");
  const result = await new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath, ...args], {
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

async function runVerifyWithFakeBuildFailure() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "app-v2-runtime-verify-fail-"));
  try {
    const scriptSource = path.join(process.cwd(), "scripts", "app_v2_runtime_verify.mjs");
    const supportSource = path.join(process.cwd(), "scripts", "app_v2_runtime_verify_support.mjs");
    const scriptDest = path.join(workspace, "scripts", "app_v2_runtime_verify.mjs");
    const supportDest = path.join(workspace, "scripts", "app_v2_runtime_verify_support.mjs");
    await fs.mkdir(path.dirname(scriptDest), { recursive: true });
    await fs.cp(scriptSource, scriptDest);
    await fs.cp(supportSource, supportDest);

    const fakeBin = path.join(workspace, "bin");
    await fs.mkdir(fakeBin, { recursive: true });
    const fakeNpm = path.join(fakeBin, "npm");
    await fs.writeFile(
      fakeNpm,
      "#!/usr/bin/env sh\n" +
        "echo 'forced npm build failure for regression' >&2\n" +
        "exit 12\n",
      { mode: 0o755 }
    );

    const emptyUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "app-v2-verify-empty-"));
    const result = await runVerify(
      ["--focus", "live-read", "--json", "--user-data-dir", emptyUserDataDir],
      {
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`
      },
      {
        cwd: workspace,
        scriptPath: path.join(workspace, "scripts", "app_v2_runtime_verify.mjs")
      }
    );
    return result;
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
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

  const earlyFailure = await runVerifyWithFakeBuildFailure();
  assert.equal(earlyFailure.code, 1, `early failure should still fail in runtime verify\nstdout:\n${earlyFailure.stdout}\nstderr:\n${earlyFailure.stderr}`);
  const earlyFailureJson = JSON.parse(earlyFailure.stdout);
  assert.equal(earlyFailureJson.focus, "live-read");
  assert.equal(earlyFailureJson.overallReady, false);
  assert.equal(earlyFailureJson.blockingSources[0], "runtime-error");
  assert.equal(earlyFailureJson.sheet.status, "error");
  assert.match(earlyFailureJson.sheet.summary, /app build:main failed before runtime verify/);
  assert.match(earlyFailureJson.sheet.lastError, /app build:main failed before runtime verify/);

  console.log("regression_app_v2_runtime_verify: OK");
}

main();
