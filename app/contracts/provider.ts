import type { ProviderType } from "./auth";

export interface DateRangeQuery {
  startDate: string;
  endDate: string;
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
