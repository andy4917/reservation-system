import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const root = process.cwd();
  const appSource = read(root, "app_v2/renderer/App.tsx");

  assert.match(appSource, /실조회 준비 상태/);
  assert.match(appSource, /최근 실조회 근거/);
  assert.match(appSource, /세션 준비/);
  assert.match(appSource, /sourceLineage/);

  console.log("regression_app_v2_live_read_proof_contract: OK");
}

main();
