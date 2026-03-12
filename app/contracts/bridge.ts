import type { AuthCaptureRequest, AuthCaptureResponse, AuthRestoreRequest, AuthRestoreResponse, ProviderType } from "./auth";
import type { BridgeFailure } from "./errors";
import type {
  DomSnapshotRequest,
  DomSnapshotResponse,
  FetchProviderRowsRequest,
  FetchProviderRowsResponse,
  FetchReservationsRequest,
  FetchReservationsResponse
} from "./provider";

export interface BridgePingRequest {
  type: "bridge.ping";
}

export interface BridgePingResponse {
  ok: true;
  connected: boolean;
  bridgeVersion: string;
}

export interface BridgeContextRequest {
  type: "bridge.getContext";
}

export interface BridgeContextResponse {
  ok: true;
  provider: ProviderType | null;
  host: string | null;
  url: string | null;
  sessionAvailable: boolean;
}

export interface BridgeRuntimeStatus {
  ok: true;
  connected: boolean;
  capability: "ready" | "degraded";
  host: string;
  port: number;
  updatePath: string;
  statePath: string;
  authConfigured: boolean;
  code: BridgeFailure["code"] | null;
  message: string;
  recoveryAction: string | null;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  maxBodyBytes: number;
}

export type BridgeRequest =
  | BridgePingRequest
  | BridgeContextRequest
  | AuthCaptureRequest
  | AuthRestoreRequest
  | FetchProviderRowsRequest
  | FetchReservationsRequest
  | DomSnapshotRequest;

export type BridgeSuccessResponse =
  | BridgePingResponse
  | BridgeContextResponse
  | AuthCaptureResponse
  | AuthRestoreResponse
  | FetchProviderRowsResponse
  | FetchReservationsResponse
  | DomSnapshotResponse;

export type BridgeResponse =
  | BridgeSuccessResponse
  | {
      ok: false;
      failure: BridgeFailure;
    };
