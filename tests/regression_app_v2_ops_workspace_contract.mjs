import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(root, relativePath) {
  const filePath = path.join(root, relativePath);
  assert.equal(fs.existsSync(filePath), true, `${relativePath} should exist`);
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const root = process.cwd();
  const contracts = read(root, "src/desktop/app-v2-contracts.ts");
  const runner = read(root, "app_v2/main/reservationActionRunner.ts");
  const appSource = read(root, "app_v2/renderer/App.tsx");
  const styles = read(root, "app_v2/renderer/styles/app.css");

  assert.match(contracts, /AppOpsViewSnapshot/);
  assert.match(contracts, /orderListRows: AppOpsOrderRow\[]/);
  assert.match(contracts, /arrivalRows: AppOpsArrivalRow\[]/);
  assert.match(contracts, /opsView\?: AppOpsViewSnapshot \| null/);

  assert.match(runner, /buildOpsViewSnapshot/);
  assert.match(runner, /orderlist_report\.tsv/);
  assert.match(runner, /arrival_report\.tsv/);
  assert.match(runner, /opsView,/);

  assert.match(appSource, /오더리스트 작업 로그/);
  assert.match(appSource, /어라이벌 일정판/);
  assert.match(appSource, /운영 카운트/);
  assert.match(appSource, /특이 사항/);

  assert.match(styles, /\.ops-order-layout/);
  assert.match(styles, /\.ops-arrival-board/);
  assert.match(styles, /\.arrival-cell-block/);

  console.log("regression_app_v2_ops_workspace_contract: OK");
}

main();
