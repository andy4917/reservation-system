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

  const modulePath = path.join(root, "dist-app", "app_v2", "main", "wingsSharedCredentials.js");
  const run = new Function(
    "modulePath",
    `
      return import(modulePath).then(({ parseWingsSharedCredentialsText }) => {
        const parsed = parseWingsSharedCredentialsText(\`WINGS 선릉

USER ID : seolleung
PASSWORD : seolleung@345

WINGS 강남

USER ID : gangnam
PASSWORD : gangnam2580

WINGS 코엑스

USER ID : coex
PASSWORD : coex@123\`);
        return parsed;
      });
    `
  );

  const parsed = await run(modulePath);
  assert.equal(parsed.companyId, "UHSUITE");
  assert.equal(parsed.branches.SEOLLEUNG.loginId, "seolleung");
  assert.equal(parsed.branches.SEOLLEUNG.password, "seolleung@345");
  assert.equal(parsed.branches.GANGNAM.loginId, "gangnam");
  assert.equal(parsed.branches.COEX.loginId, "coex");
  assert.equal(parsed.branches.SAMSUNG, null);

  console.log("regression_app_v2_wings_shared_credentials_import: OK");
}

await main();
