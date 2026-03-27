import type { AppProvider, AppReadSource } from "../../src/desktop/app-v2-contracts.js";
import { getBranchLabel, getProviderLabel, type DisplayState, type StatusBadge } from "./model.js";
import { useAppWorkbench } from "./state.js";

function Badge({ value }: { value: StatusBadge }) {
  return <span className="badge">{value}</span>;
}

function DisplayValue({ value }: { value: DisplayState }) {
  if (!value.badge && !value.text) {
    return null;
  }
  return (
    <>
      {value.badge ? <Badge value={value.badge} /> : null}
      {value.text ? <span className="value-text">{value.text}</span> : null}
    </>
  );
}

function Sidebar({ workbench }: { workbench: ReturnType<typeof useAppWorkbench> }) {
  return (
    <aside className="sidebar">
      {workbench.sidebarMenus.map((menu) => (
        <button
          key={menu.id}
          type="button"
          className="sidebar-button"
          data-selected={workbench.activeMenu === menu.id}
          data-locked={workbench.menuLocks[menu.id].locked}
          disabled={workbench.menuLocks[menu.id].locked && workbench.activeMenu !== menu.id}
          onClick={() => workbench.selectMenu(menu.id)}
        >
          {menu.label}
        </button>
      ))}
    </aside>
  );
}

function SessionMenu({ workbench }: { workbench: ReturnType<typeof useAppWorkbench> }) {
  const sessionBadge = workbench.sessionDisplay.badge;
  return (
    <section className="panel-stack">
      {workbench.providerSnapshots.map(({ provider, snapshot }) => (
        <div key={provider} className="provider-row">
          <div className="provider-main">
            <span className="provider-name">{getProviderLabel(provider)}</span>
            <DisplayValue value={workbench.getProviderDisplay(snapshot)} />
          </div>
          <div className="button-row">
            <button type="button" className="ghost" onClick={() => workbench.openProvider(provider)} disabled={workbench.busyMenu === "session"}>
              열기
            </button>
            <button type="button" className="ghost" onClick={() => workbench.recheckProvider(provider)} disabled={workbench.busyMenu === "session"}>
              재확인
            </button>
          </div>
        </div>
      ))}
      {workbench.sessionDisplay.text ? <div className="inline-state">{workbench.sessionDisplay.text}</div> : null}
      {sessionBadge ? (
        <div className="inline-state">
          <Badge value={sessionBadge} />
        </div>
      ) : null}
    </section>
  );
}

function ReadSourceButton({
  source,
  workbench,
}: {
  source: AppReadSource;
  workbench: ReturnType<typeof useAppWorkbench>;
}) {
  const display = workbench.getSourceDisplay(workbench.sourceSnapshots[source]);
  return (
    <button type="button" className="source-button ghost" onClick={() => workbench.runSourceRead(source)} disabled={workbench.busyMenu === "read"}>
      <span>{source.toUpperCase()}</span>
      <DisplayValue value={display} />
    </button>
  );
}

function ReadMenu({ workbench }: { workbench: ReturnType<typeof useAppWorkbench> }) {
  return (
    <section className="panel-stack">
      <div className="branch-row">
        {workbench.branchOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className="branch-button"
            data-selected={workbench.selectedBranch === option.value}
            onClick={() => workbench.selectBranch(option.value)}
            disabled={workbench.busyMenu === "read"}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="field-grid">
        <label className="field">
          <span>시작</span>
          <input type="date" value={workbench.dateRange.startDate} onChange={(event) => workbench.updateDateField("startDate", event.target.value)} disabled={workbench.busyMenu === "read"} />
        </label>
        <label className="field">
          <span>종료</span>
          <input type="date" value={workbench.dateRange.endDate} onChange={(event) => workbench.updateDateField("endDate", event.target.value)} disabled={workbench.busyMenu === "read"} />
        </label>
      </div>

      <div className="button-row">
        {/* runBundleRead delegates to fetchLiveReadBundle in state/API */}
        <button type="button" onClick={() => workbench.runBundleRead()} disabled={workbench.busyMenu === "read"}>
          읽기
        </button>
        <button type="button" className="ghost" onClick={() => workbench.setSettingsOpen(!workbench.settingsOpen)} disabled={workbench.busyMenu === "read"}>
          설정
        </button>
      </div>

      <div className="source-grid">
        <ReadSourceButton source="pms" workbench={workbench} />
        <ReadSourceButton source="ota" workbench={workbench} />
        <ReadSourceButton source="sheet" workbench={workbench} />
      </div>

      <div className="inline-state">
        <DisplayValue value={workbench.readDisplay} />
      </div>

      {workbench.settingsOpen ? (
        <div className="settings-panel">
          <label className="field field-wide">
            <span>spreadsheet</span>
            <input type="text" value={workbench.settingsForm.spreadsheet} onChange={(event) => workbench.updateSettingsSpreadsheet(event.target.value)} disabled={workbench.busyMenu === "read"} />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>강남</span>
              <input type="text" value={workbench.settingsForm.sheetTabs.gangnam} onChange={(event) => workbench.updateSettingsTab("gangnam", event.target.value)} disabled={workbench.busyMenu === "read"} />
            </label>
            <label className="field">
              <span>코엑스</span>
              <input type="text" value={workbench.settingsForm.sheetTabs.coex} onChange={(event) => workbench.updateSettingsTab("coex", event.target.value)} disabled={workbench.busyMenu === "read"} />
            </label>
            <label className="field">
              <span>선릉</span>
              <input type="text" value={workbench.settingsForm.sheetTabs.seolleung} onChange={(event) => workbench.updateSettingsTab("seolleung", event.target.value)} disabled={workbench.busyMenu === "read"} />
            </label>
            <label className="field">
              <span>삼성</span>
              <input type="text" value={workbench.settingsForm.sheetTabs.samseong} onChange={(event) => workbench.updateSettingsTab("samseong", event.target.value)} disabled={workbench.busyMenu === "read"} />
            </label>
          </div>
          <div className="button-row">
            <button type="button" onClick={() => workbench.saveSettings()} disabled={workbench.busyMenu === "read"}>
              저장
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ActionList({ workbench }: { workbench: ReturnType<typeof useAppWorkbench> }) {
  return (
    <div className="action-list">
      {workbench.actionOptions.map((action) => {
        const lockReason = workbench.getActionLockReason(action);
        return (
          <button
            key={action}
            type="button"
            className="action-item"
            data-selected={workbench.selectedAction === action}
            disabled={lockReason != null && workbench.selectedAction !== action}
            onClick={() => workbench.selectAction(action)}
          >
            <span>{action}</span>
            {lockReason && workbench.selectedAction === action ? <span className="value-text">{lockReason}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function WorkMenu({ workbench }: { workbench: ReturnType<typeof useAppWorkbench> }) {
  return (
    <section className="work-layout">
      <ActionList workbench={workbench} />
      <div className="panel-stack">
        <div className="field-grid">
          <label className="field">
            <span>지점</span>
            <input type="text" value={getBranchLabel(workbench.selectedBranch)} readOnly />
          </label>
          <label className="field">
            <span>시작</span>
            <input type="date" value={workbench.dateRange.startDate} onChange={(event) => workbench.updateDateField("startDate", event.target.value)} disabled={workbench.busyMenu === "work"} />
          </label>
          <label className="field">
            <span>종료</span>
            <input type="date" value={workbench.dateRange.endDate} onChange={(event) => workbench.updateDateField("endDate", event.target.value)} disabled={workbench.busyMenu === "work"} />
          </label>
        </div>

        <div className="button-row">
          <button type="button" onClick={() => workbench.runSelectedAction(false)} disabled={workbench.busyMenu === "work"}>
            {workbench.selectedAction}
          </button>
          {workbench.selectedAction === "apply" && workbench.isConfirmReady ? (
            <button type="button" className="ghost" onClick={() => workbench.runSelectedAction(true)} disabled={workbench.busyMenu === "work"}>
              확정
            </button>
          ) : null}
        </div>

        <div className="inline-state">
          <DisplayValue value={workbench.workDisplay} />
        </div>
      </div>
    </section>
  );
}

function ResultMenu({ workbench }: { workbench: ReturnType<typeof useAppWorkbench> }) {
  if (workbench.resultRows.length === 0) {
    return (
      <section className="panel-stack">
        <DisplayValue value={workbench.resultDisplay} />
      </section>
    );
  }

  return (
    <section className="result-layout">
      <div className="panel-stack">
        <div className="inline-state">
          <DisplayValue value={workbench.resultDisplay} />
        </div>
        <div className="result-list">
          {workbench.resultRows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="result-row"
              data-selected={workbench.selectedResultRowId === row.id}
              onClick={() => workbench.selectResultRow(row.id)}
            >
              <div className="result-copy">
                <strong>{row.primary}</strong>
                <span>{row.secondary}</span>
              </div>
              <span className="row-status">{row.statusLabel}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="detail-card">
        {workbench.selectedResultRow ? (
          <div className="detail-values">
            <strong>{workbench.selectedResultRow.primary}</strong>
            <span>{workbench.selectedResultRow.secondary}</span>
            <span className="row-status">{workbench.selectedResultRow.statusLabel}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function App() {
  const workbench = useAppWorkbench();

  return (
    <main className="workbench-shell">
      <Sidebar workbench={workbench} />
      <section className="workspace">
        {workbench.activeMenu === "session" ? <SessionMenu workbench={workbench} /> : null}
        {workbench.activeMenu === "read" ? <ReadMenu workbench={workbench} /> : null}
        {workbench.activeMenu === "work" ? <WorkMenu workbench={workbench} /> : null}
        {workbench.activeMenu === "result" ? <ResultMenu workbench={workbench} /> : null}
      </section>
    </main>
  );
}
