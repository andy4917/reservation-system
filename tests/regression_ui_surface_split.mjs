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

  assert.match(rightPanel, /상세 정보/);
  assert.match(rightPanel, /search-result-card/);
  assert.match(rightPanel, /jumpToSearchResult/);
  assert.match(rightPanel, /전달물/);
  assert.match(rightPanel, /exportOperatorHandoff/);
  assert.match(rightPanel, /repeatOperatorHandoff/);
  assert.match(rightPanel, /현재 전달물/);
  assert.match(rightPanel, /후속 현황/);
  assert.match(rightPanel, /장기 후속 필요/);
  assert.match(rightPanel, /최근 이력 밖에 후속 필요/);
  assert.match(rightPanel, /오래된 순 정렬/);
  assert.match(rightPanel, /일 경과|오늘 전달/);
  assert.match(rightPanel, /미확인만|후속 필요만|확인됨만/);
  assert.match(rightPanel, /전달 내용 보기/);
  assert.match(rightPanel, /전달 이력/);
  assert.match(rightPanel, /다시 복사|다시 저장/);
  assert.match(rightPanel, /setOperatorHandoffStatus/);
  assert.doesNotMatch(rightPanel, /quick-switch|launcher|drag/i);

  assert.match(inventorySurface, /재고 조회/);
  assert.match(inventorySurface, /사이트 값과 시트 값 비교/);
  assert.doesNotMatch(inventorySurface, /recommendationAssist|recommendationRuntime/);
  assert.match(reservationSurface, /예약 점검/);
  assert.match(reservationSurface, /점검 준비 상태/);
  assert.match(settingsSurface, /추천 기록|거절/);
  assert.match(settingsSurface, /전달물 패널 열기/);

  assert.equal(fs.existsSync(path.join(root, "src/sheetScanner.entry.js")), false);
  assert.equal(fs.existsSync(path.join(root, "src/ui/productFlow.js")), false);

  console.log("regression_ui_surface_split: OK");
}

main();
