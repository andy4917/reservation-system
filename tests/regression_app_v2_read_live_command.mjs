import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(root, relativePath) {
  const filePath = path.join(root, relativePath);
  assert.equal(fs.existsSync(filePath), true, `${relativePath} should exist`);
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const root = process.cwd();
  const pkg = JSON.parse(read(root, "package.json"));
  const command = pkg.scripts["read-live"];
  assert.equal(command, "node scripts/app_v2_read_live.mjs");

  const script = read(root, "scripts/app_v2_read_live.mjs");
  assert.match(script, /app_v2_runtime_verify\.mjs/);
  assert.match(script, /--focus",\s*"live-read"/);
  assert.match(script, /--json/);
  assert.match(script, /read-live confirmed/);
  assert.match(script, /read-live not ready/);

  console.log("regression_app_v2_read_live_command: OK");
}

main();
