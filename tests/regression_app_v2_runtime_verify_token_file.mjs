import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function main() {
  const root = process.cwd();
  const build = spawnSync("npm", ["run", "app:build:main"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, `app:build:main should succeed\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`);

  const tokenFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "app-v2-token-file-")), "google-token.json");
  await fs.writeFile(
    tokenFile,
    `${JSON.stringify(
      {
        access_token: "token-access-value",
        refresh_token: "token-refresh-value",
        client_id: "token-client-id",
        client_secret: "token-client-secret"
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const modulePath = path.join(root, "scripts", "app_v2_runtime_verify_support.mjs");
  const run = new Function(
    "modulePath",
    "tokenFile",
    `
      return import(modulePath).then(({ buildRuntimeVerifyEnv }) => buildRuntimeVerifyEnv({
        env: {},
        googleTokenFile: tokenFile
      }));
    `
  );

  const env = await run(modulePath, tokenFile);
  assert.equal(env.UHS_GOOGLE_ACCESS_TOKEN, undefined);
  assert.equal(env.UHS_GOOGLE_REFRESH_TOKEN, "token-refresh-value");
  assert.equal(env.UHS_GOOGLE_CLIENT_ID, "token-client-id");
  assert.equal(env.UHS_GOOGLE_CLIENT_SECRET, "token-client-secret");

  console.log("regression_app_v2_runtime_verify_token_file: OK");
}

await main();
