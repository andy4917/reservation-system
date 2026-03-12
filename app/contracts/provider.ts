import type { ProviderType } from "./auth";

export interface DateRangeQuery {
  startDate: string;
  endDate: string;
}

export interface ProviderInventoryCompareRow {
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
}

export interface FetchReservationsRequest {
  type: "provider.fetchReservations";
  provider: ProviderType;
  query: DateRangeQuery;
}

export interface FetchReservationsResponse<T = unknown> {
  ok: true;
  provider: ProviderType;
  payload: T[];
  usedDomFallback: boolean;
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
