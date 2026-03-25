import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function main() {
  const root = process.cwd();
  const modulePath = path.join(root, "dist-app", "app_v2", "main", "runtimeSafety.js");
  const build = spawnSync("npm", ["run", "app:build:main"], {
    cwd: root,
    encoding: "utf8"
  });
  const canReuseExistingBuild =
    build.status !== 0 &&
    /(node_modules\/typescript\/bin\/tsc|(^|\n)sh:\s*1:\s*tsc:\s*not found)/.test(`${build.stdout}\n${build.stderr}`) &&
    fs.existsSync(modulePath);
  assert.equal(
    build.status === 0 || canReuseExistingBuild,
    true,
    `app:build:main should succeed or fall back to an existing dist-app build\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`,
  );
  const run = new Function(
    "modulePath",
    `
      return import(modulePath).then(({ buildLiveReadRuntimeErrorSnapshot, buildPendingSourceActionSnapshot, buildStableWingsRuntimeCacheKey }) => {
        const liveError = buildLiveReadRuntimeErrorSnapshot({
          source: "pms",
          branch: "COEX",
          blockedReason: "upstream unavailable",
          evidence: ["pageState:loaded"],
          error: new Error("401 upstream")
        });

        const pending = buildPendingSourceActionSnapshot({
          action: "compare",
          branch: "GANGNAM",
          startDate: "2026-03-20",
          endDate: "2026-03-21",
          checkedAt: "2026-03-20T00:00:00.000Z",
          reason: "source bundle 준비 실패",
          evidence: ["pmsSource:unavailable"]
        });

        const cacheKeyA = buildStableWingsRuntimeCacheKey({
          sync: "{\\"a\\":1}",
          harBranches: "HAR-A",
          gangnamHar: "/tmp/g.har",
          coexHar: "/tmp/c.har",
          authBundle: {
            cookieHeader: "a=1",
            csrfToken: "csrf",
            authorization: "Bearer token-1",
            capturedAt: "2026-03-20T00:00:00.000Z"
          }
        });

        const cacheKeyB = buildStableWingsRuntimeCacheKey({
          sync: "{\\"a\\":1}",
          harBranches: "HAR-A",
          gangnamHar: "/tmp/g.har",
          coexHar: "/tmp/c.har",
          authBundle: {
            cookieHeader: "a=1",
            csrfToken: "csrf",
            authorization: "Bearer token-1",
            capturedAt: "2026-03-20T00:00:05.000Z"
          }
        });

        return { liveError, pending, cacheKeyA, cacheKeyB };
      });
    `
  );

  return Promise.resolve(run(modulePath)).then(({ liveError, pending, cacheKeyA, cacheKeyB }) => {
    assert.equal(liveError.status, "error");
    assert.equal(liveError.recordsImported, 0);
    assert.equal(liveError.blockedReason, "upstream unavailable");
    assert.equal(liveError.evidence.some((entry) => entry.includes("error:401 upstream")), true);
    assert.equal(Array.isArray(liveError.items), true);
    assert.equal(liveError.items.length, 0);

    assert.equal(pending.status, "done");
    assert.equal(pending.engineStatus, "pending-source");
    assert.equal(pending.rows.length, 1);
    assert.equal(pending.rows[0].id, "compare-pending");
    assert.equal(pending.rows[0].statusLabel, "PENDING");
    assert.equal(pending.rows[0].detail, "source-bundle-missing");
    assert.equal(pending.rows[0].secondary.includes("source bundle"), true);
    assert.equal(
      pending.rows.some((row) => /synthetic/i.test(`${row.id} ${row.primary} ${row.secondary} ${row.detail}`)),
      false
    );

    assert.equal(cacheKeyA, cacheKeyB);

    console.log("regression_app_v2_runtime_safety_behavior: OK");
  });
}

await main();
