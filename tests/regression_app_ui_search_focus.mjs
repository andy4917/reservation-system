import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const root = process.cwd();
  const uiStore = read(root, "app/renderer/state/uiStore.ts");
  const inventorySurface = read(root, "app/renderer/components/surfaces/InventoryCompareSurface.tsx");
  const reservationSurface = read(root, "app/renderer/components/surfaces/ReservationAuditSurface.tsx");
  const settingsSurface = read(root, "app/renderer/components/surfaces/SettingsSurface.tsx");

  assert.match(uiStore, /activeFocus:\s*\{/);
  assert.match(uiStore, /rowId:\s*hit\.jumpTarget\.rowId/);
  assert.match(uiStore, /anchorId:\s*hit\.jumpTarget\.anchorId/);
  assert.match(uiStore, /sectionKey:\s*hit\.jumpTarget\.sectionKey/);
  assert.match(inventorySurface, /activeFocus\?\.task === "inventory-compare"/);
  assert.match(inventorySurface, /is-focused-row/);
  assert.match(reservationSurface, /activeFocus\?\.task === "reservation-audit"/);
  assert.match(settingsSurface, /activeFocus\?\.task === "settings"/);
  assert.match(settingsSurface, /activeFocus\?\.task === "settings" && activeFocus\.anchorId === item\.anchorId/);
  assert.match(
    settingsSurface,
    /activeFocus\?\.task === "settings" && activeFocus\.lineIndex === sheetRead\.visibleSlice\.offset \+ index/
  );

  console.log("regression_app_ui_search_focus: OK");
}

main();
