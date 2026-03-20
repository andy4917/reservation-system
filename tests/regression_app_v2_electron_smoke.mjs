import assert from "node:assert/strict";
import { spawn } from "node:child_process";

async function main() {
  const root = process.cwd();

  const result = await new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/app_v2_electron_smoke.mjs"], {
      cwd: root,
      env: { ...process.env },
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

  assert.equal(result.code, 0, `electron smoke should exit 0\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

  console.log("regression_app_v2_electron_smoke: OK");
}

main();
