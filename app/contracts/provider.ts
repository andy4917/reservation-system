import type { ProviderType } from "./auth.js";

export interface DateRangeQuery {
  startDate: string;
  endDate: string;
}

export interface ProviderInventoryCompareRow {
  provider?: ProviderType;
  branch?: string;
  reservationRef?: string;
  roomNo?: string;
  date: string;
  roomType: string;
  channel: string;
  siteRaw: string;
  sheetRaw: string;
  diff?: string;
  status?: "match" | "mismatch" | "warning";
  reason?: string;
  action?: string;
  rawLine?: string;
  sourceLineIndex?: number | null;
  candidateBasis?: string[];
  signals?: Array<{
    kind: string;
    value: string;
    source: "line" | "context";
  }>;
  tags?: Array<{
    kind: string;
    value: string;
  }>;
}

export interface FetchProviderRowsRequest {
  type: "provider.fetchRows";
  provider: ProviderType;
  query: DateRangeQuery;
}

export interface FetchProviderRowsResponse<T = unknown> {
  ok: true;
  provider: ProviderType;
  payload: T[];
  usedDomFallback: boolean;
  source?: string;
  endpointCapability?: string;
  profilesFetched?: Array<{
    branch?: string;
    url?: string;
    endpointCapability?: string;
    recordCount?: number;
    error?: string;
  }>;
}

export interface FetchReservationsRequest {
  type: "provider.fetchReservations";
  provider: ProviderType;
  query: DateRangeQuery;
}

export interface FetchSheetSnapshotRequest {
  type: "provider.fetchSheetSnapshot";
  query: DateRangeQuery;
}

export interface FetchSheetSnapshotSummary {
  spreadsheetId: string;
  sheetName: string;
  startDate: string;
  endDate: string;
  readMode: string;
  reservationBlockCount: number;
  validationIssueCount: number;
  inventoryRows: {
    NAVER: number | null;
    STATION: number | null;
  };
  providerValueDays: {
    NAVER: number;
    STATION: number;
  };
}

export interface FetchSheetSnapshotResponse {
  ok: true;
  payload: FetchSheetSnapshotSummary | null;
  source?: string;
  error?: string;
}

export interface FetchReservationsResponse<T = unknown> {
  ok: true;
  provider: ProviderType;
  payload: T[];
  usedDomFallback: boolean;
  source?: string;
  endpointCapability?: string;
  profilesFetched?: Array<{
    branch?: string;
    url?: string;
    endpointCapability?: string;
    recordCount?: number;
    error?: string;
  }>;
}

export interface ProviderReservationRow {
  branch?: string;
  sourceSystem?: string;
  reservationNo: string;
  reservationRef?: string;
  channel?: string;
  checkin: string;
  checkout: string;
  nights?: number;
  roomNo?: string;
  roomNos?: string[];
  roomTypeCode?: string;
  roomTypeName?: string;
  price?: number | null;
  account?: string;
  sourceCode?: string;
  status?: string;
  statusBucket?: "ACTIVE" | "CANCELED";
  auditAnomaly?: boolean;
  nationalityCode?: string;
  languageCode?: string;
  languageName?: string;
  guestName?: string;
  phoneTail?: string;
  remarkHead?: string;
  endpointCapability?: string;
}

export interface FetchWingsLiveContractRequest {
  type: "provider.fetchWingsLiveContract";
  provider: "wings-pms";
  capability: string;
  request?: Record<string, unknown>;
}

export interface FetchWingsLiveContractResponse<T = unknown> {
  ok: true;
  provider: "wings-pms";
  capability: string;
  payload: T[];
  usedDomFallback: false;
  source?: string;
  endpointCapability?: string;
  profilesFetched?: Array<{
    branch?: string;
    url?: string;
    endpointCapability?: string;
    recordCount?: number;
    error?: string;
  }>;
}

export interface DomSnapshotRequest {
  type: "provider.domSnapshot";
  provider: ProviderType;
  query?: DateRangeQuery;
}

export interface DomSnapshotResponse<T = unknown> {
  ok: true;
  provider: ProviderType;
  payload: T;
  usedDomFallback: true;
}
