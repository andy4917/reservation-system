export type ProviderType = "naver-partner" | "admin-station" | "wings-pms";

export interface ExtractedCandidateTag {
  kind: "date" | "ratio" | "channel" | "reservation_ref" | "room_no" | "branch";
  value: string;
}

export interface ExtractedCandidateSignal {
  kind: "date" | "ratio" | "channel" | "reservation_ref" | "room_no" | "branch";
  value: string;
  source: "line" | "context";
}

export interface ExtractedCandidateRow {
  date: string;
  roomType: string;
  channel: string;
  siteRaw: string;
  sheetRaw: string;
  diff: string;
  status: "match" | "mismatch" | "warning";
  reason: string;
  action: string;
  reservationRef?: string | null;
  roomNo?: string | null;
  branch?: string | null;
  rawLine?: string;
  sourceLineIndex?: number | null;
  candidateBasis?: string[];
  signals?: ExtractedCandidateSignal[];
  tags?: ExtractedCandidateTag[];
}

export interface BridgeContext {
  providerType: ProviderType | null;
  host: string | null;
  url: string;
  title: string | null;
}

export interface DomSnapshot {
  url: string;
  title: string;
  bodyTextSample: string;
}

export interface AuthSummary {
  cookieCount: number;
  domains: string[];
  hasBearer: boolean;
  hasCsrf: boolean;
  hasRole: boolean;
}

export interface BridgeAuthBundle {
  provider: ProviderType;
  capturedAt: string;
  sourceHost?: string;
  sourceUrls?: string[];
  cookies?: Array<Record<string, unknown>>;
  material?: {
    cookieHeader?: string;
    csrfToken?: string;
    role?: string;
    bearerToken?: string;
  };
}

export interface InfoSummary {
  count: number;
  channels: string[];
  dates: string[];
}

export interface BridgeInfoSnapshot {
  context: BridgeContext;
  rowSummary: InfoSummary | null;
  authSummary: AuthSummary | null;
}

export interface BridgePayload {
  provider: ProviderType;
  host: string | null;
  url: string;
  title: string | null;
  bodyTextSample: string;
  rows: ExtractedCandidateRow[];
  infoSummary: InfoSummary | null;
  authSummary: AuthSummary | null;
  authBundle?: BridgeAuthBundle | null;
  updatedAt: string;
}

export interface SheetDefaultsPolicy {
  spreadsheetId: string;
  sheetName: string;
  sheetGid: number;
  startRow: number;
  year: number;
  googleClientId: string;
  googleScope: string;
  redirectUri: string;
  tokenFile: string;
  pkceFile: string;
}

export interface BridgePolicy {
  host: string;
  port: number;
  updatePath: string;
  statePath: string;
  secret?: string;
  timeoutMs?: number;
}

export interface NoteChannelPrefixPolicy {
  enabled: boolean;
  template: string;
}

export interface RoomPreset {
  id: string;
  name: string;
}

export interface SyncPolicySchema {
  sheetDefaults: SheetDefaultsPolicy;
  defaultNaverBusinessId: string;
  defaultStationBranchId: string;
  defaultNaverRoomIds: string[];
  defaultStationRoomIds: string[];
  defaultStationApiBase: string;
  defaultNaverApiBase: string;
  bridge: BridgePolicy;
  noteChannelPrefix: NoteChannelPrefixPolicy;
  roomPresets: Record<string, RoomPreset[]>;
  roomTypeByRoomNo: Record<string, string>;
  providerTargetMax: Record<string, number>;
  applyBlockingValidationWarnCodes: string[];
  applyBlockingStationWarningCodes: string[];
}

export interface InventoryInfoBridgeGlobal {
  normalizeText?: (value: unknown) => string;
  detectContext?: (host: string, href: string, title: string) => BridgeContext;
  summarizeRows?: (rows: ExtractedCandidateRow[]) => InfoSummary | null;
}

export interface InventoryEntryPolicyGlobal {
  normalizeText?: (value: unknown) => string;
  detectProviderTypeFromHost?: (host: string) => ProviderType | "";
}

export interface InventoryProviderAuthCaptureGlobal {
  collectHints?: (providerType: ProviderType) => Record<string, string>;
}

export interface BridgeAppGlobal {
  bridge?: {
    getContext?: () => BridgeContext;
    getDomSnapshot?: () => DomSnapshot;
    pushBridgeState?: () => Promise<void>;
    getInfoSummary?: () => BridgeInfoSnapshot;
  };
}

export interface InventorySyncPolicyGlobal extends Partial<SyncPolicySchema> {
  __ready?: boolean;
  POLICY_JSON?: string;
}

declare global {
  interface BridgeAuthCaptureResponse {
    summary?: AuthSummary | null;
    authBundle?: BridgeAuthBundle | null;
  }

  const chrome:
    | {
        runtime?: {
          sendMessage?: (
            message: unknown,
            callback?: (response?: BridgeAuthCaptureResponse) => void
          ) => void;
          onMessage?: {
            addListener?: (
              listener: (
                message: unknown,
                sender: unknown,
                sendResponse: (response?: unknown) => void
              ) => boolean | void
            ) => void;
          };
          lastError?: { message?: string };
        };
      }
    | undefined;

  interface Window {
    App?: BridgeAppGlobal;
    InventoryInfoBridge?: InventoryInfoBridgeGlobal;
    InventoryEntryPolicy?: InventoryEntryPolicyGlobal;
    InventoryProviderAuthCapture?: InventoryProviderAuthCaptureGlobal;
    InventorySyncPolicy?: InventorySyncPolicyGlobal;
  }

  interface GlobalThis {
    App?: BridgeAppGlobal;
    InventoryInfoBridge?: InventoryInfoBridgeGlobal;
    InventoryEntryPolicy?: InventoryEntryPolicyGlobal;
    InventoryProviderAuthCapture?: InventoryProviderAuthCaptureGlobal;
    InventorySyncPolicy?: InventorySyncPolicyGlobal;
  }

  var App: BridgeAppGlobal | undefined;
  var InventoryInfoBridge: InventoryInfoBridgeGlobal | undefined;
  var InventoryEntryPolicy: InventoryEntryPolicyGlobal | undefined;
  var InventoryProviderAuthCapture: InventoryProviderAuthCaptureGlobal | undefined;
  var InventorySyncPolicy: InventorySyncPolicyGlobal | undefined;
}

export {};
