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
  assert.equal(build.status, 0, `app:build:main should succeed\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`);

  const distManagerPath = path.join(root, "dist-app", "app_v2", "main", "providerWorkspaceManager.js");
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "wings-browser-login-bootstrap-"));
  const loaderPath = path.join(tmpDir, "electron-mock-loader.mjs");
  const probePath = path.join(tmpDir, "probe.mjs");
  const credsPath = path.join(tmpDir, "wings-creds.txt");

  try {
    writeFileSync(
      credsPath,
      [
        "@pms wings 테스트 계정 ( read only)",
        "",
        "강남 id : gangnam\tpassword : gangnam2580",
        "",
        "코엑스 id : coex\tpassword : coex@123",
        ""
      ].join("\n"),
      "utf8"
    );

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
              __mockState: (() => {
                const state = globalThis.__electronMockState || {
                  loginSubmitted: 0,
                  currentUrl: "https://pms.sanhait.com/login",
                  title: "Wings Login",
                  loggedIn: false
                };
                globalThis.__electronMockState = state;
                return state;
              })(),
              session: {
                fromPartition() {
                  return {
                    fetch: async () => ({ ok: true, status: 200, url: "https://pms.sanhait.com/", headers: { get: () => "" }, text: async () => "" })
                  };
                }
              },
              BrowserWindow: class BrowserWindow {
                constructor() {
                  this._destroyed = false;
                  this._listeners = {};
                  this.webContents = {
                    session: {
                      cookies: {
                        get: async () => globalThis.__electronMockState.loggedIn ? [{ name: "JSESSIONID", value: "ok", domain: "pms.sanhait.com", path: "/", secure: true, httpOnly: true, sameSite: "lax", session: true }] : []
                      }
                    },
                    isLoading: () => false,
                    getURL: () => globalThis.__electronMockState.currentUrl,
                    on: (event, handler) => { this._listeners[event] = handler; },
                    stop: () => {},
                    executeJavaScript: async (script) => {
                      const text = String(script || "");
                      if (text.includes("window.localStorage")) {
                        return { localStorage: [], sessionStorage: [] };
                      }
                      if (text.includes("__uhsWingsAutoLogin")) {
                        globalThis.__electronMockState.loginSubmitted += 1;
                        globalThis.__electronMockState.loggedIn = true;
                        globalThis.__electronMockState.currentUrl = "https://pms.sanhait.com/pms";
                        globalThis.__electronMockState.title = "Wings Workspace";
                        return { attempted: true, submitted: true, usernameFilled: true, passwordFilled: true };
                      }
                      return null;
                    }
                  };
                }
                isDestroyed() { return this._destroyed; }
                isVisible() { return false; }
                on() {}
                async loadURL() {
                  if (this._listeners["did-start-loading"]) this._listeners["did-start-loading"]();
                  if (this._listeners["did-finish-load"]) this._listeners["did-finish-load"]();
                  return Promise.resolve();
                }
                getTitle() { return globalThis.__electronMockState.title; }
                destroy() { this._destroyed = true; }
              }
            };\`
          };
        }
        return defaultLoad(url, _context, defaultLoad);
      }\n`;

    const probeSource = `
      import { ensureProviderBrowser, getProviderBrowserState, destroyProviderBrowsers } from "${distManagerPath}";
      await ensureProviderBrowser("wings-pms", "GANGNAM");
      const state = await getProviderBrowserState("wings-pms");
      process.stdout.write(JSON.stringify({
        state,
        loginSubmitted: globalThis.__electronMockState.loginSubmitted
      }));
      destroyProviderBrowsers();
    `;

    writeFileSync(loaderPath, loaderSource, "utf8");
    writeFileSync(probePath, probeSource, "utf8");

    const probe = spawnSync(process.execPath, ["--loader", loaderPath, probePath], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        UHS_WINGS_CREDENTIALS_FILE: credsPath
      }
    });

    assert.equal(
      probe.status,
      0,
      `wings browser session bootstrap probe should succeed\nstdout:\n${probe.stdout}\nstderr:\n${probe.stderr}`
    );
    const result = JSON.parse(probe.stdout || "{}");

    assert.equal(result.loginSubmitted, 1, "Wings login bootstrap should submit credentials through the browser DOM");
    assert.equal(result.state.providerCookieCount, 1, "Wings provider session cookie should exist after bootstrap");
    assert.equal(result.state.currentHost, "pms.sanhait.com");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("regression_app_v2_wings_browser_session_login_bootstrap: OK");
}

await main();
