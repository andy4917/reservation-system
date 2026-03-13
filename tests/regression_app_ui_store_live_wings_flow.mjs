import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL, fileURLToPath } from "node:url";

function buildLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

async function loadBuiltModule(entryPath, globals = {}) {
  const context = vm.createContext({
    console,
    Date,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    performance,
    ...globals
  });
  context.globalThis = context;
  const moduleCache = new Map();

  async function loadExternal(specifier) {
    const namespace = await import(specifier);
    const exportNames = Object.keys(namespace);
    const synthetic = new vm.SyntheticModule(exportNames, function () {
      exportNames.forEach((name) => {
        this.setExport(name, namespace[name]);
      });
    }, { context, identifier: specifier });
    await synthetic.evaluate();
    return synthetic;
  }

  async function loadFile(resolvedPath) {
    const normalizedPath = path.resolve(resolvedPath);
    if (moduleCache.has(normalizedPath)) {
      return moduleCache.get(normalizedPath);
    }

    const source = await fs.promises.readFile(normalizedPath, "utf8");
    const mod = new vm.SourceTextModule(source, {
      context,
      identifier: pathToFileURL(normalizedPath).href,
      initializeImportMeta(meta) {
        meta.url = pathToFileURL(normalizedPath).href;
      }
    });
    moduleCache.set(normalizedPath, mod);
    await mod.link(async (specifier, referencingModule) => {
      if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
        return loadExternal(specifier);
      }

      const referencingPath = fileURLToPath(referencingModule.identifier);
      const candidateBase = path.resolve(path.dirname(referencingPath), specifier);
      const fileCandidates = [
        candidateBase,
        `${candidateBase}.js`,
        path.join(candidateBase, "index.js")
      ];
      const nextPath = fileCandidates.find((candidate) => {
        if (!fs.existsSync(candidate)) return false;
        return fs.statSync(candidate).isFile();
      });
      if (!nextPath) {
        throw new Error(`Unable to resolve ${specifier} from ${referencingPath}`);
      }
      return loadFile(nextPath);
    });
    await mod.evaluate();
    return mod;
  }

  const entry = await loadFile(entryPath);
  return entry.namespace;
}

async function main() {
  const root = process.cwd();
  const window = {
    localStorage: buildLocalStorage(),
    desktopBridge: {
      ping: async () => ({ ok: true, runtime: "electron-main", ts: "2026-03-12T09:00:00.000Z" }),
      getContext: async () => ({
        ok: true,
        provider: "wings-pms",
        host: "pms.sanhait.com",
        url: "https://pms.sanhait.com/pms/biz/ir04_0200X_V03/searchListRsvn.do",
        sessionAvailable: true
      }),
      fetchProviderRows: async () => ({
        ok: true,
        provider: "wings-pms",
        payload: [],
        usedDomFallback: false,
        source: "unsupported-provider"
      }),
      fetchProviderReservations: async () => ({
        ok: true,
        provider: "wings-pms",
        payload: [
          {
            reservationNo: "25170918",
            guestName: "홍길동",
            channel: "BOOKING",
            checkin: "2026-03-01",
            checkout: "2026-03-03",
            statusBucket: "ACTIVE",
            auditAnomaly: false,
            branch: "GANGNAM",
            sourceCode: "BOOKING",
            nationalityCode: "USA",
            languageCode: "ENG",
            languageName: "English",
            endpointCapability: "reservation_lookup"
          },
          {
            reservationNo: "25170919",
            guestName: "김다은",
            channel: "AGODA",
            checkin: "2026-03-02",
            checkout: "2026-03-04",
            statusBucket: "ACTIVE",
            auditAnomaly: false,
            branch: "COEX",
            sourceCode: "",
            nationalityCode: "KOR",
            endpointCapability: "reservation_lookup"
          }
        ],
        usedDomFallback: false,
        source: "pms-api",
        endpointCapability: "reservation_lookup"
      }),
      fetchWingsLiveContract: async () => ({
        ok: true,
        provider: "wings-pms",
        capability: "source_catalog",
        payload: [],
        usedDomFallback: false,
        source: "pms-api"
      }),
      getBridgeMeta: async () => ({ ok: true, port: 45123 }),
      getBridgeRuntime: async () => ({
        ok: true,
        connected: true,
        capability: "ready",
        host: "127.0.0.1",
        port: 45123,
        updatePath: "/bridge/update",
        statePath: "/bridge/state",
        authConfigured: true,
        code: null,
        message: "Bridge ready.",
        recoveryAction: null,
        rateLimitWindowMs: 10000,
        rateLimitMaxRequests: 20,
        maxBodyBytes: 131072,
        requestTimeoutMs: 3000
      }),
      getBridgeSummary: async () => ({
        ok: true,
        authSummary: {
          cookieCount: 2,
          domains: ["pms.sanhait.com"],
          hasBearer: false,
          hasCsrf: true,
          hasRole: true
        },
        infoSummary: {
          count: 2,
          channels: ["BOOKING", "AGODA"],
          dates: ["2026-03-01", "2026-03-02"]
        },
        preview: null
      }),
    }
  };

  const modulePath = path.join(root, "dist-app/renderer/state/uiStore.js");
  const { useUiStore } = await loadBuiltModule(modulePath, { window });
  useUiStore.setState((state) => ({
    ...state,
    runtimeMode: "live"
  }));

  await useUiStore.getState().refreshInventoryCompare();
  const state = useUiStore.getState();

  assert.equal(state.reservationAudit.supportLevel, "read-live");
  assert.equal(state.reservationAudit.rows.length, 1);
  assert.equal(state.reservationAudit.reviewCount, 0);
  assert.equal(state.bridgeStatus.message, "브라우저가 연결되었습니다.");
  assert.match(
    state.jobStatusCards.find((job) => job.id === "reservation-audit")?.detail || "",
    /예약 데이터를 읽을 수 있습니다\./
  );
  assert.ok(
    state.providerCards
      .find((card) => card.provider === "wings-pms")
      ?.capabilities.includes("예약 조회")
  );

  console.log("regression_app_ui_store_live_wings_flow: OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
