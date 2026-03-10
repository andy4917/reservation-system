import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadScript(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function resetBrowserGlobals() {
  delete globalThis.__NEXT_DATA__;
  delete globalThis.__NUXT__;
  delete globalThis.__APOLLO_STATE__;
  delete globalThis.__INITIAL_STATE__;
  delete globalThis.__PRELOADED_STATE__;
  globalThis.document = {
    querySelectorAll() {
      return [];
    }
  };
}

function setLocationForProvider(providerType) {
  if (providerType === "naver-partner") {
    globalThis.location = {
      pathname: "/businesses/1356779",
      href: "https://partner.booking.naver.com/businesses/1356779",
      hash: ""
    };
    return;
  }
  globalThis.location = {
    pathname: "/branch/18",
    href: "https://admin.admin-stationbyuhc.com/branch/18",
    hash: ""
  };
}

function buildGridRows(preset, query, suffix = "") {
  const dates = [];
  let cursor = new Date(`${query.startDate}T00:00:00Z`);
  const end = new Date(`${query.endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return dates.flatMap((date, dateIndex) =>
    preset.map((room, roomIndex) => ({
      date,
      roomId: String(room.id),
      roomName: `${room.name}${suffix}`,
      settingStock: 4 + roomIndex,
      reservedStock: roomIndex,
      totalStock: 6 + dateIndex + roomIndex,
      availableStock: 4 + roomIndex,
      displayCurrent: roomIndex,
      displayMaximum: 6 + dateIndex + roomIndex,
      openStatus: "OPEN"
    }))
  );
}

function buildStationPayload(rows) {
  return { data: rows };
}

function buildNaverItemPayload(preset) {
  return {
    items: preset.map((room) => ({
      bizItemId: String(room.id),
      bizItemName: String(room.name)
    }))
  };
}

function buildNaverSchedulePayload(rows) {
  return rows.reduce((acc, row) => {
    acc[row.date] = {
      date: row.date,
      stock: row.availableStock,
      bookingCount: row.reservedStock,
      totalStock: row.totalStock,
      isSaleDay: true
    };
    return acc;
  }, {});
}

function buildFetchStub(providerType, preset, mode, fullRows) {
  if (providerType === "admin-station") {
    if (mode === "api_error_dom_only") {
      return async () => {
        throw new Error("station api outage");
      };
    }
    const payloadRows = mode === "api_low_coverage" ? fullRows.slice(0, 3) : fullRows;
    return async () => ({
      ok: true,
      status: 200,
      async json() {
        return buildStationPayload(payloadRows);
      }
    });
  }

  const payloadRowsByRoom = new Map();
  preset.forEach((room) => {
    const rows = fullRows.filter((row) => String(row.roomId) === String(room.id));
    payloadRowsByRoom.set(
      String(room.id),
      mode === "api_low_coverage" ? rows.slice(0, 1) : rows
    );
  });

  return async (url) => {
    if (mode === "api_error_dom_only") {
      throw new Error("naver api outage");
    }
    const href = String(url);
    const matchedRoomId = [...payloadRowsByRoom.keys()].find((roomId) => href.includes(`/${roomId}/daily-schedules`));
    if (matchedRoomId) {
      return {
        ok: true,
        status: 200,
        async json() {
          return buildNaverSchedulePayload(payloadRowsByRoom.get(matchedRoomId) || []);
        }
      };
    }

    if (href.includes("/biz-items")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return buildNaverItemPayload(preset);
        }
      };
    }

    assert.fail(`unexpected Naver URL: ${href}`);
  };
}

async function runScenario(pmsFetch, presets, providerType, query, mode) {
  resetBrowserGlobals();
  setLocationForProvider(providerType);
  const preset = presets[providerType];
  const fullRows = buildGridRows(preset, query);
  const domRows = fullRows.map((row) => ({ ...row, source: "dom_fallback" }));

  if (mode === "api_low_coverage" || mode === "api_error_dom_only") {
    globalThis.__NEXT_DATA__ = { props: { pageProps: { calendarRows: domRows } } };
  }

  globalThis.fetch = buildFetchStub(providerType, preset, mode, fullRows);
  const rows = await pmsFetch.fetchProviderRows(providerType, query);
  const coverage = pmsFetch.assessProviderRowsCoverage(rows, query, providerType);
  const sourceCount = pmsFetch.summarizeProviderRowSources(rows);
  const meta = pmsFetch.getLastProviderFetchMeta(providerType);
  const stats = pmsFetch.getProviderFetchInstrumentation(providerType);
  return {
    rowCount: rows.length,
    sourceCount,
    coverage,
    meta,
    stats
  };
}

async function main() {
  const root = process.cwd();
  globalThis.App = { runtime: { syncConfigCache: {} } };
  resetBrowserGlobals();
  globalThis.fetch = async () => {
    throw new Error("fetch stub not installed");
  };
  globalThis.location = { pathname: "/", href: "https://example.test/", hash: "" };

  [
    "src/constants.js",
    "src/scan/normalize.js",
    "src/engine/rules.js"
  ]
    .map((p) => path.join(root, p))
    .forEach(loadScript);

  globalThis.App.scan.normalize.createSessionRequestContext = () => ({
    async build(_url, init) {
      return init;
    },
    async buildVariants(_url, init) {
      return [init];
    }
  });

  loadScript(path.join(root, "src/io/pms.fetch.js"));

  const pmsFetch = globalThis.App?.io?.pmsFetch;
  const presets = globalThis.App?.constants?.ROOM_PRESETS;
  assert.ok(pmsFetch, "App.io.pmsFetch is required");
  assert.ok(typeof pmsFetch.assessProviderRowsCoverage === "function", "coverage helper export is required");
  assert.ok(typeof pmsFetch.summarizeProviderRowSources === "function", "source summary helper export is required");
  assert.ok(typeof pmsFetch.getLastProviderFetchMeta === "function", "last fetch meta export is required");
  assert.ok(typeof pmsFetch.getProviderFetchInstrumentation === "function", "instrumentation export is required");

  const query = { startDate: "2026-03-01", endDate: "2026-03-03" };
  const providers = ["admin-station", "naver-partner"];
  const summary = {};

  for (const providerType of providers) {
    const apiOnly = await runScenario(pmsFetch, presets, providerType, query, "api_full");
    const degraded = await runScenario(pmsFetch, presets, providerType, query, "api_low_coverage");
    const domOnly = await runScenario(pmsFetch, presets, providerType, query, "api_error_dom_only");

    assert.equal(apiOnly.coverage.acceptable, true, `${providerType} API-only path should cover the full preset grid`);
    assert.equal(apiOnly.sourceCount.dom, 0, `${providerType} API-only path should not need DOM rows`);
    assert.equal(apiOnly.meta?.route, "api_only_accept", `${providerType} API-only path should record api_only_accept`);
    assert.equal(degraded.coverage.acceptable, true, `${providerType} degraded path should recover coverage after DOM merge`);
    assert.ok(degraded.sourceCount.dom > 0, `${providerType} degraded path should include DOM fallback rows`);
    assert.ok(degraded.rowCount > degraded.sourceCount.api, `${providerType} degraded path should expand beyond partial API rows`);
    assert.equal(degraded.meta?.route, "api_dom_merge", `${providerType} degraded path should record api_dom_merge`);
    assert.equal(domOnly.coverage.acceptable, true, `${providerType} DOM-only fallback path should still cover the full preset grid`);
    assert.equal(domOnly.sourceCount.api, 0, `${providerType} DOM-only fallback path should not contain API rows`);
    assert.ok(domOnly.sourceCount.dom > 0, `${providerType} DOM-only fallback path should contain DOM rows`);
    assert.equal(domOnly.meta?.route, "dom_only_fallback", `${providerType} DOM-only path should record dom_only_fallback`);
    assert.equal(domOnly.stats?.apiOnlyAccept, 1, `${providerType} should count one API-only accept`);
    assert.equal(domOnly.stats?.apiDomMerge, 1, `${providerType} should count one API+DOM merge`);
    assert.equal(domOnly.stats?.domOnlyFallback, 1, `${providerType} should count one DOM-only fallback`);
    assert.equal(domOnly.stats?.totalFetches, 3, `${providerType} should record three fetch attempts`);

    const classification =
      apiOnly.coverage.acceptable && degraded.sourceCount.dom > 0 ? "bridge-candidate" : "app-first";
    assert.equal(classification, "bridge-candidate", `${providerType} should stay bridgeable, not app-first`);

    summary[providerType] = {
      apiOnly,
      degraded,
      domOnly,
      classification
    };
  }

  console.log("regression_ota_dom_fallback_poc: OK");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
