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
  const pkg = JSON.parse(read(root, "package.json"));
  const installerScript = read(root, "scripts/build_app_v2_installer.mjs");
  const releaseDoc = read(root, "docs/runtime/APP_V2_WINDOWS_INSTALLER.md");

  assert.equal(pkg.scripts["app:dist:win"], "node scripts/build_app_v2_installer.mjs");
  assert.equal(typeof pkg.devDependencies["electron-builder"], "string");
  assert.equal(pkg.build?.appId, "com.uhs.reservation.desktop");
  assert.equal(pkg.build?.productName, "UHS Reservation Desktop");
  assert.equal(pkg.build?.directories?.output, "dist/installer");
  assert.equal(pkg.build?.win?.icon, "icons/desktop-icon.ico");
  assert.equal(pkg.build?.win?.signAndEditExecutable, false);
  assert.match(JSON.stringify(pkg.build?.win?.target), /portable/i);
  assert.equal(Array.isArray(pkg.build?.extraResources), true);
  assert.match(JSON.stringify(pkg.build.extraResources), /"from":"src"/);
  assert.match(JSON.stringify(pkg.build.extraResources), /"\*\*\/\*\.py"/);
  assert.match(JSON.stringify(pkg.build.extraResources), /"from":"reservation_sheet_audit\.py"/);
  assert.match(JSON.stringify(pkg.build.extraResources), /app_v2_live_sheet_bridge\.py/);
  assert.match(JSON.stringify(pkg.build.extraResources), /app_v2_reservation_management_bridge\.py/);
  assert.match(installerScript, /electron-builder/);
  assert.match(installerScript, /app:build/);
  assert.match(installerScript, /--win/);
  assert.match(installerScript, /portable/);
  assert.match(installerScript, /powershell\.exe|cmd\.exe/);
  assert.match(installerScript, /WINDOWS_NODE_EXE|Get-Command\s+node/);
  assert.doesNotMatch(installerScript, /\\$node\s*=\s*\"C:\\\\Program Files\\\\nodejs\\\\node\.exe\"/);
  assert.match(releaseDoc, /dist\/installer\/UHS Reservation Desktop 0\.1\.0\.exe/i);
  assert.match(releaseDoc, /app:dist:win/);
  assert.match(releaseDoc, /portable/i);
  assert.match(releaseDoc, /portable executable|직접 실행/i);
  assert.match(releaseDoc, /historical/i);
  assert.doesNotMatch(releaseDoc, /installer flow|별도 인스톨러|installer-only/);

  console.log("regression_app_v2_installer_package_contract: OK");
}

main();
