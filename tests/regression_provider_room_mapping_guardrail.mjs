import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadScript(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInThisContext(code, { filename: filePath });
}

function main() {
  const root = process.cwd();
  globalThis.App = {};
  [
    "src/constants.js",
    "src/scan/normalize.js",
    "src/engine/noteKey.js",
    "src/engine/rules.js",
    "src/domain/reservationPolicy.js",
    "src/io/pms.fetch.js"
  ]
    .map((p) => path.join(root, p))
    .forEach(loadScript);

  const pmsFetch = globalThis.App?.io?.pmsFetch;
  const presets = globalThis.App?.constants?.ROOM_PRESETS;
  assert.ok(pmsFetch?.resolvePresetRoomId, "resolvePresetRoomId must exist");
  assert.ok(presets?.["admin-station"], "admin-station preset must exist");

  const preset = presets["admin-station"];
  const idMap = new Map(preset.map((room) => [String(room.id), String(room.name)]));

  const exact = pmsFetch.resolvePresetRoomId("", "Urban Spa Suite 6인", preset, idMap);
  assert.equal(exact.method, "name_exact");
  assert.equal(exact.matchedName, "Urban Spa Suite 6인");

  const typeHintLabels = ["Urban", "Grand", "Urban 6인", "Double Twin 4인"];
  typeHintLabels.forEach((label) => {
    const result = pmsFetch.resolvePresetRoomId("", label, preset, idMap);
    assert.equal(result.method, "name_type", `type hint alias should remain type-matched: ${label}`);
    assert.equal(result.confidence < 0.9, true, `type hint alias confidence should stay below warning threshold: ${label}`);
  });

  const ambiguousLabels = ["6인 객실명 미정", "8인 객실명 미정", "더 선릉 6인 (8)", "Spa 4인"];
  ambiguousLabels.forEach((label) => {
    const result = pmsFetch.resolvePresetRoomId("", label, preset, idMap);
    assert.equal(result.method, "unmatched", `ambiguous label should stay unmatched: ${label}`);
    assert.equal(result.confidence, 0, `ambiguous label confidence should stay 0: ${label}`);
  });

  console.log("regression_provider_room_mapping_guardrail: OK");
}

main();
