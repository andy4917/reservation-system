import type { RuntimeMode } from "../contracts";
import type { LiveSupportLevel } from "../contracts";

export type AppTaskId =
  | "inventory-compare"
  | "reservation-audit"
  | "apply-review"
  | "settings"
  | "dry-run";

export type RightPanelTab = "evidence" | "ops" | "validation" | "logs";

export interface BridgeStatus {
  connected: boolean;
  sessionAvailable: boolean;
  activeHost: string;
  provider: string;
  message: string;
}

export interface SummaryMetric {
  label: string;
  value: string;
  tone?: "default" | "warn" | "critical" | "ok";
}

export interface InventoryCompareRow {
  id: string;
  date: string;
  roomType: string;
  channel: string;
  siteRaw: string;
  sheetRaw: string;
  diff: string;
  status: "match" | "mismatch" | "warning";
  reason: string;
  action: string;
}

export interface InventoryCompareSnapshot {
  title: string;
  supportLevel: LiveSupportLevel;
  sourceLabel: string;
  lastRunAt: string;
  rows: InventoryCompareRow[];
  mismatchCount: number;
  warningCount: number;
  matchedCount: number;
  evidenceLines: string[];
  opsLines: string[];
  validationLines: string[];
  logs: string[];
}

export interface WorkspaceMockState {
  runtimeMode: RuntimeMode;
  activeTask: AppTaskId;
  selectedRange: {
    startDate: string;
    endDate: string;
  };
  bridgeStatus: BridgeStatus;
  metrics: SummaryMetric[];
  logs: string[];
  evidenceLines: string[];
  opsLines: string[];
  validationLines: string[];
  inventoryCompare: InventoryCompareSnapshot;
  inventoryCompareLoading: boolean;
}
