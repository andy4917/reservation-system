import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadPanelTemplate(root) {
  const source = fs.readFileSync(path.join(root, "src/ui/panelTemplate.js"), "utf8");
  const sandbox = {
    globalThis: {},
    console
  };
  sandbox.globalThis.App = {
    constants: {
      TEXT: new Proxy({}, { get: (_target, key) => String(key) })
    }
  };
  vm.runInNewContext(source, sandbox, { filename: "panelTemplate.js" });
  return {
    source,
    html: sandbox.globalThis.App?.ui?.panelTemplate?.HTML || ""
  };
}

function main() {
  const root = process.cwd();
  const entrySource = fs.readFileSync(path.join(root, "src/sheetScanner.entry.js"), "utf8");
  const constantsSource = fs.readFileSync(path.join(root, "src/constants.js"), "utf8");
  const { source: templateSource, html } = loadPanelTemplate(root);

  assert.match(html, /id="hostContextBar"/, "host context bar should exist");
  assert.match(html, /id="taskNavigation"/, "panel task navigation should exist");
  assert.match(html, /id="taskNavInventoryBtn"/, "inventory task nav button should exist");
  assert.match(html, /id="taskNavReservationBtn"/, "reservation task nav button should exist");
  assert.match(html, /id="taskNavSheetBtn"/, "sheet task nav button should exist");
  assert.match(html, /id="taskNavAuditBtn"/, "audit task nav button should exist");
  assert.match(html, /id="flowGateCard"/, "flow gate card should exist");
  assert.match(html, /id="flowGateUtilityBtn"/, "flow gate utility button should exist");
  assert.match(html, /id="flowGateRefreshBtn"/, "flow gate refresh button should exist");
  assert.match(html, /id="supportPolicyBox"/, "support policy box should exist");
  assert.match(html, /id="supportPolicyList"/, "support policy list should exist");
  assert.doesNotMatch(html, /id="taskResultsBtn"/, "results should not exist as a top-level task");
  assert.doesNotMatch(html, /id="utilityResultsBtn"/, "results rail shortcut should be removed");
  assert.doesNotMatch(html, /id="utilitySettingsBtn"/, "settings rail shortcut should be removed");
  assert.doesNotMatch(html, /id="utilityDebugBtn"/, "debug rail shortcut should be removed");
  assert.doesNotMatch(html, /launcher/i, "in-page launcher should be removed");

  assert.match(html, /id="secondarySurface"/, "secondary surface should exist");
  assert.match(html, /id="evidenceResultTabBtn"/, "evidence result tab should exist");
  assert.match(html, /id="evidenceBlockingTabBtn"/, "evidence blocking tab should exist");
  assert.match(html, /id="evidenceValidationTabBtn"/, "evidence validation tab should exist");
  assert.match(html, /id="evidenceTraceTabBtn"/, "evidence trace tab should exist");
  assert.match(html, /id="evidenceExportTabBtn"/, "evidence export tab should exist");
  assert.match(html, /id="utilityScopeTabBtn"/, "utility scope tab should exist");
  assert.match(html, /id="utilitySettingsTabBtn"/, "utility settings tab should exist");
  assert.match(html, /id="utilityOpsTabBtn"/, "utility ops tab should exist");
  assert.match(html, /id="utilityDebugTabBtn"/, "utility debug tab should exist");
  assert.match(html, /id="widthCollapsedBtn"/, "collapsed width control should exist");
  assert.match(html, /id="widthStandardBtn"/, "standard width control should exist");
  assert.match(html, /id="widthExpandedBtn"/, "expanded width control should exist");
  assert.match(html, /id="taskGuideCard"/, "task guide card should exist");
  assert.match(html, /id="taskGuideTitle"/, "task guide title should exist");
  assert.match(html, /id="taskGuideAction"/, "task guide action should exist");
  assert.match(html, /id="taskGuideEvidenceBtn"/, "task guide evidence button should exist");
  assert.match(html, /id="taskGuideUtilityBtn"/, "task guide utility button should exist");
  assert.match(html, /Expanded는 Focus에서만 활성화됩니다\./, "focus-only expanded guidance should exist");

  assert.match(html, /id="scopeDrawer"/, "scope should live in the utility surface");
  assert.match(html, /id="sheetBox"/, "settings should live in the utility surface");
  assert.match(html, /id="opsSection"/, "ops should live in the utility surface");
  assert.match(html, /id="debugWrap"/, "trace log surface should still exist");
  assert.match(html, /id="syncResultWrap"/, "result evidence should still exist");
  assert.match(html, /id="syncBlockWrap"/, "blocking evidence should still exist");
  assert.match(html, /id="verifyIssueWrap"/, "validation evidence should still exist");

  assert.match(entrySource, /densityMode:\s*"standard"/, "density mode state should exist");
  assert.match(entrySource, /panelWidthMode:\s*"standard"/, "panel width mode state should exist");
  assert.match(entrySource, /secondarySurfaceKind:\s*"evidence"/, "secondary surface kind state should exist");
  assert.match(entrySource, /activeEvidenceTab:\s*"result"/, "active evidence tab state should exist");
  assert.match(entrySource, /activeUtilityTab:\s*"scope"/, "active utility tab state should exist");
  assert.match(entrySource, /bootstrapped:\s*false/, "bootstrapped state should exist");
  assert.match(entrySource, /function setPanelWidthMode\(mode\)/, "panel width mode setter should exist");
  assert.match(entrySource, /nextMode === "expanded" && normalizeDensityMode\(state\.densityMode\) !== "focus"/, "expanded width should be gated by focus mode");
  assert.match(entrySource, /if \(nextMode !== "focus" && state\.panelWidthMode === "expanded"\)/, "leaving focus should reset expanded width");
  assert.match(entrySource, /openEvidenceTab\(/, "evidence tab orchestration should exist");
  assert.match(entrySource, /openUtilityTab\(/, "utility tab orchestration should exist");
  assert.match(entrySource, /function preferredEvidenceTabForTask\(taskId = state\.activeTask\)/, "task-specific evidence defaults should exist");
  assert.match(entrySource, /function preferredUtilityTabForTask\(taskId = state\.activeTask\)/, "task-specific utility defaults should exist");
  assert.match(entrySource, /function renderTaskGuideCard\(\)/, "task guide renderer should exist");
  assert.match(entrySource, /function renderSupportPolicySurface\(\)/, "support policy renderer should exist");
  assert.doesNotMatch(entrySource, /panelPosition:/, "anchored panel should not persist floating position state");
  assert.doesNotMatch(entrySource, /dragPointerId|clearPanelInlinePosition|applyPanelPosition|restorePanelPositionIfAny|endPanelDrag/, "floating drag helpers should be removed");
  assert.doesNotMatch(entrySource, /\bstarted:\s*/, "legacy started state should be removed");
  assert.doesNotMatch(entrySource, /renderOnboardingChecklist|ONBOARDING_HIDE_KEY|task-results/, "legacy onboarding or task state should be removed");

  assert.match(templateSource, /\.wrap\.fit-standard \.panel/, "standard density class should exist");
  assert.match(templateSource, /\.wrap\.fit-focus \.panel/, "focus density class should exist");
  assert.match(templateSource, /\.wrap\.fit-compact \.panel/, "compact density class should exist");
  assert.match(templateSource, /\.wrap\.width-collapsed \.panel/, "collapsed width class should exist");
  assert.match(templateSource, /\.wrap\.width-standard \.panel/, "standard width class should exist");
  assert.match(templateSource, /\.wrap\.width-expanded \.panel/, "expanded width class should exist");
  assert.match(templateSource, /bottom:\s*max\(12px,\s*calc\(env\(safe-area-inset-bottom\)\s*\+\s*8px\)\)/, "panel should be bottom-anchored");
  assert.doesNotMatch(templateSource, /\.panel\.is-dragging/, "dragging style should be removed");
  assert.doesNotMatch(templateSource, /panel-quick-switch|quick-switch-btn/, "quick switch CSS should be removed");
  assert.doesNotMatch(templateSource, /cursor:\s*grab;/, "anchored header should not keep grab cursor");
  assert.doesNotMatch(templateSource, /touch-action:\s*none;/, "anchored header should not disable touch by default");
  assert.doesNotMatch(templateSource, /70vh/, "anchored panel should not keep 70vh fallback sizing");
  assert.doesNotMatch(templateSource, /task-results/, "legacy results task styling should be removed");
  assert.doesNotMatch(constantsSource, /quickSwitchTitle|quickSwitchMain|quickSwitchSync|quickSwitchSettings|quickSwitchOps/, "quick switch constants should be removed");
  assert.doesNotMatch(constantsSource, /ONBOARDING_HIDE_KEY|onboardingTitle|onboardingSheet|onboardingAuth|onboardingRange|onboardingTest|onboardingHide/, "onboarding constants should be removed");
  assert.doesNotMatch(constantsSource, /toggleStart/, "legacy launcher copy should be removed");
  assert.doesNotMatch(constantsSource, /설정 > 운영/, "stale settings hierarchy copy should be removed from constants");
  assert.doesNotMatch(entrySource, /설정 > 운영/, "stale settings hierarchy copy should be removed from runtime hints");
  assert.doesNotMatch(templateSource, /메인 작업면/, "stale main workspace copy should be removed from template");

  console.log("regression_ui_surface_split: OK");
}

main();
