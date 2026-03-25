import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function main() {
  const root = process.cwd();
  const build = spawnSync("npm", ["run", "app:build:main"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(build.status, 0, `app:build:main should succeed\\nstdout:\\n${build.stdout}\\nstderr:\\n${build.stderr}`);

  const distManagerPath = path.join(root, "dist-app", "app_v2", "main", "providerWorkspaceManager.js");
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "provider-storage-snapshot-reg-"));
  const loaderPath = path.join(tmpDir, "electron-mock-loader.mjs");
  const probePath = path.join(tmpDir, "probe.mjs");
  const mockError = "simulated-storage-read-error";

  try {
    const loaderSource = `
      export async function resolve(specifier, _context, defaultResolve) {
        if (specifier === "electron") {
          return { url: "electron:", shortCircuit: true };
        }
        return defaultResolve(specifier, _context, defaultResolve);
      }

      export async function load(url, _context, defaultLoad) {
        if (url === "electron:") {
          return {
            format: "module",
            shortCircuit: true,
            source: \`export default {
              BrowserWindow: class BrowserWindow {
                constructor() {
                  this._destroyed = false;
                  this.webContents = {
                    session: { cookies: { get: async () => [] } },
                    isLoading: () => false,
                    getURL: () => "https://pms.sanhait.com/",
                    on: () => {},
                    stop: () => {},
                    executeJavaScript: async () => {
                      throw new Error(process.env.ELECTRON_STORAGE_READ_ERROR);
                    }
                  };
                }
                isDestroyed() {
                  return this._destroyed;
                }
                isVisible() {
                  return false;
                }
                on() {}
                loadURL() {
                  return Promise.resolve();
                }
                getTitle() {
                  return "Wings Workspace";
                }
                destroy() {
                  this._destroyed = true;
                }
              }
            };\`
          };
        }
        return defaultLoad(url, _context, defaultLoad);
      }\n`;

    const probeSource = `
      import {
        destroyProviderBrowsers,
        ensureProviderBrowser,
        getProviderBrowserState,
        getProviderBrowserStorageSnapshot
      } from "${distManagerPath}";

      const beforeState = await getProviderBrowserState("wings-pms");
      const beforeSnapshot = await getProviderBrowserStorageSnapshot("wings-pms");

      await ensureProviderBrowser("wings-pms");
      const failedSnapshot = await getProviderBrowserStorageSnapshot("wings-pms");
      const failedState = await getProviderBrowserState("wings-pms");

      destroyProviderBrowsers();
      process.stdout.write(JSON.stringify({ beforeState, beforeSnapshot, failedSnapshot, failedState }));
    `;

    writeFileSync(loaderPath, loaderSource);
    writeFileSync(probePath, probeSource);

    const probe = spawnSync(process.execPath, ["--loader", loaderPath, probePath], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        ELECTRON_STORAGE_READ_ERROR: mockError
      }
    });

    assert.equal(
      probe.status,
      0,
      `providerStorage snapshot probe should succeed\\nstdout:\\n${probe.stdout}\\nstderr:\\n${probe.stderr}`
    );
    const payloadMatch = probe.stdout.match(/\{[\s\S]*\}$/);
    assert.match(payloadMatch?.[0] ?? "", /^\{/);
    const result = JSON.parse(payloadMatch?.[0] || "{}");

    assert.equal(result.beforeState.storageSnapshotReadState, "not-read");
    assert.equal(result.beforeState.storageSnapshotError, null);
    assert.deepEqual(result.beforeSnapshot, { localStorage: [], sessionStorage: [] });

    assert.equal(result.failedState.storageSnapshotReadState, "error");
    assert.equal(result.failedState.storageSnapshotError, mockError);
    assert.equal(result.failedState.lastError, null);
    assert.deepEqual(result.failedSnapshot, { localStorage: [], sessionStorage: [] });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("regression_app_v2_provider_storage_snapshot: OK");
}

await main();
