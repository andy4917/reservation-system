import type { WorkspaceMockState } from "../renderer/types";

export const uiMockState: WorkspaceMockState = {
  runtimeMode: "dry-run",
  activeTask: "inventory-compare",
  selectedRange: {
    startDate: "2026-03-12",
    endDate: "2026-03-15"
  },
  bridgeStatus: {
    connected: false,
    sessionAvailable: false,
    activeHost: "bridge not connected",
    provider: "NAVER/STATION",
    message: "Dry-run mode. Live session bridge is not attached yet."
  },
  metrics: [
    { label: "Mismatch", value: "12", tone: "critical" },
    { label: "Preview Warn", value: "3", tone: "warn" },
    { label: "Reservation Audit", value: "5 anomaly", tone: "warn" },
    { label: "Apply Ready", value: "Blocked", tone: "critical" }
  ],
  logs: [
    "Workspace booted in dry-run mode.",
    "Mock inventory rows loaded.",
    "Mock sheet snapshot loaded.",
    "Validation summary assembled."
  ],
  evidenceLines: [
    "Mismatch evidence: Urban 03-13 site=4 / sheet=6",
    "TracePacket count: 12",
    "Provider source usage: room_raw=18, room_derived=2"
  ],
  opsLines: [
    "Policy: ACTIVE / CANCELED model",
    "Retention: reservation_no, ota, date, nights, room, normalized guest, phone tail, token hash",
    "Anomaly candidates: 5"
  ],
  validationLines: [
    "Scan validation: error 0 / warn 2",
    "Preview validation: error 1 / warn 3",
    "Type coverage: Urban 20/20, Double 20/20, Grand 1/1"
  ],
  inventoryCompareLoading: false,
  inventoryCompare: {
    title: "Inventory Compare",
    supportLevel: "dry-run-only",
    sourceLabel: "Dry-run fixture",
    lastRunAt: "2026-03-10T06:56:46.000Z",
    mismatchCount: 2,
    warningCount: 1,
    matchedCount: 1,
    rows: [
      {
        id: "urban-0312",
        date: "2026-03-12",
        roomType: "Urban",
        channel: "NAVER",
        siteRaw: "4/6",
        sheetRaw: "6/6",
        diff: "-2",
        status: "mismatch",
        reason: "site sold count lagging behind sheet snapshot",
        action: "bridge live read before apply"
      },
      {
        id: "urban-0313",
        date: "2026-03-13",
        roomType: "Urban",
        channel: "STATION",
        siteRaw: "4/6",
        sheetRaw: "6/6",
        diff: "-2",
        status: "mismatch",
        reason: "raw row and derived row disagree",
        action: "compare provider row vs value row"
      },
      {
        id: "double-0313",
        date: "2026-03-13",
        roomType: "Double Twin",
        channel: "NAVER",
        siteRaw: "2/3",
        sheetRaw: "2/3",
        diff: "0",
        status: "match",
        reason: "sheet and provider aligned",
        action: "keep"
      },
      {
        id: "grand-0314",
        date: "2026-03-14",
        roomType: "Grand",
        channel: "STATION",
        siteRaw: "closed",
        sheetRaw: "0/1",
        diff: "warn",
        status: "warning",
        reason: "provider closed text parsed via fallback",
        action: "require dom snapshot on live bridge"
      }
    ],
    evidenceLines: [
      "Compare source: dry-run",
      "Mismatch rows: 2",
      "2026-03-12 Urban NAVER 4/6 vs 6/6",
      "2026-03-13 Urban STATION 4/6 vs 6/6"
    ],
    opsLines: [
      "Bridge contract path: bridge.getContext -> provider.fetchRows -> provider.domSnapshot",
      "Support level: dry-run-only",
      "Warnings requiring manual review: 1"
    ],
    validationLines: [
      "Validation gate: mismatch rows remain, apply blocked",
      "Validation gate: fixture snapshot loaded"
    ],
    logs: [
      "Inventory compare loaded for dry-run mode.",
      "Rows prepared: 4",
      "Mismatch summary built: 2"
    ]
  }
};
