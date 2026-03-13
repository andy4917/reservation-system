import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const root = process.cwd();
  const taskMeta = read(root, "app/renderer/config/taskMeta.ts");
  const taskWorkspace = read(root, "app/renderer/components/TaskWorkspace.tsx");
  const rightPanel = read(root, "app/renderer/components/RightPanel.tsx");
  const inventorySurface = read(root, "app/renderer/components/surfaces/InventoryCompareSurface.tsx");
  const reservationSurface = read(root, "app/renderer/components/surfaces/ReservationAuditSurface.tsx");
  const settingsSurface = read(root, "app/renderer/components/surfaces/SettingsSurface.tsx");

  assert.match(taskMeta, /"inventory-compare"/);
  assert.match(taskMeta, /"reservation-audit"/);
  assert.match(taskMeta, /settings:/);
  assert.doesNotMatch(taskMeta, /task-results|onboarding|quick switch/i);

  assert.match(taskWorkspace, /InventoryCompareSurface/);
  assert.match(taskWorkspace, /ReservationAuditSurface/);
  assert.match(taskWorkspace, /SettingsSurface/);
  assert.doesNotMatch(taskWorkspace, /sheetScanner\.entry|task-results|onboarding/i);

  assert.match(rightPanel, /요약/);
  assert.match(rightPanel, /결과/);
  assert.match(rightPanel, /차이 항목|확인 대상/);
  assert.doesNotMatch(rightPanel, /quick-switch|launcher|drag/i);

  assert.match(inventorySurface, /재고 비교 결과/);
  assert.doesNotMatch(inventorySurface, /recommendationAssist|recommendationRuntime/);
  assert.match(reservationSurface, /예약 점검 결과/);
  assert.doesNotMatch(settingsSurface, /추천|recommendation/i);

  assert.equal(fs.existsSync(path.join(root, "src/sheetScanner.entry.js")), false);
  assert.equal(fs.existsSync(path.join(root, "src/ui/productFlow.js")), false);

  console.log("regression_ui_surface_split: OK");
}

main();
