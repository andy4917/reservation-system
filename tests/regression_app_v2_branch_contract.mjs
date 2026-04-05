import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function main() {
  const root = process.cwd();
  const build = spawnSync("npm", ["run", "app:build:main"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, `app:build:main should succeed\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`);

  const modulePath = path.join(root, "dist-app", "src", "desktop", "app-v2-contracts.js");
  const contracts = await import(modulePath);

  assert.deepEqual(contracts.APP_BRANCHES, ["COEX", "GANGNAM", "SEOLLEUNG", "SAMSUNG"]);
  assert.ok(Array.isArray(contracts.APP_BRANCH_OPTIONS), "APP_BRANCH_OPTIONS should be exported");

  const optionByBranch = new Map(contracts.APP_BRANCH_OPTIONS.map((item) => [item.branch, item]));
  assert.equal(optionByBranch.get("COEX")?.availability, "active");
  assert.equal(optionByBranch.get("GANGNAM")?.availability, "active");
  assert.equal(optionByBranch.get("SEOLLEUNG")?.availability, "active");
  assert.equal(optionByBranch.get("SAMSUNG")?.availability, "inactive");
  assert.match(String(optionByBranch.get("SEOLLEUNG")?.label || ""), /선릉/);
  assert.match(String(optionByBranch.get("SAMSUNG")?.reason || ""), /preopen|inactive|준비/i);

  console.log("regression_app_v2_branch_contract: OK");
}

await main();
