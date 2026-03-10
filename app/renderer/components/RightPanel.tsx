import { useUiStore } from "../state/uiStore";
import type { RightPanelTab } from "../types";

const TABS: Array<{ id: RightPanelTab; label: string }> = [
  { id: "evidence", label: "Evidence" },
  { id: "ops", label: "Ops" },
  { id: "validation", label: "Validation" },
  { id: "logs", label: "Logs" }
];

export function RightPanel() {
  const activeTab = useUiStore((state) => state.activeRightPanelTab);
  const setActiveTab = useUiStore((state) => state.setActiveRightPanelTab);
  const evidenceLines = useUiStore((state) => state.evidenceLines);
  const opsLines = useUiStore((state) => state.opsLines);
  const validationLines = useUiStore((state) => state.validationLines);
  const logs = useUiStore((state) => state.logs);

  const contentByTab = {
    evidence: evidenceLines,
    ops: opsLines,
    validation: validationLines,
    logs
  } satisfies Record<RightPanelTab, string[]>;

  return (
    <aside className="right-panel">
      <div className="right-panel-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`panel-tab ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="right-panel-body">
        {contentByTab[activeTab].map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </aside>
  );
}
