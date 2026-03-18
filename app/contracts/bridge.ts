import type { AuthCaptureRequest, AuthCaptureResponse, AuthRestoreRequest, AuthRestoreResponse, ProviderType } from "./auth.js";
import type { BridgeFailure } from "./errors.js";
import type {
  DeleteBindingDecisionRequest,
  DeleteBindingDecisionResponse,
  DeleteManualScanAnchorsRequest,
  DeleteManualScanAnchorsResponse,
  DomSnapshotRequest,
  DomSnapshotResponse,
  FetchLiveReadBundleRequest,
  FetchLiveReadBundleResponse,
  FetchSheetSnapshotRequest,
  FetchSheetSnapshotResponse,
  FetchProviderRowsRequest,
  FetchProviderRowsResponse,
  FetchWingsLiveContractRequest,
  FetchWingsLiveContractResponse,
  LoadBindingDecisionsRequest,
  LoadBindingDecisionsResponse,
  LoadManualScanAnchorsRequest,
  LoadManualScanAnchorsResponse,
  SaveManualScanAnchorsRequest,
  SaveManualScanAnchorsResponse,
  SaveBindingDecisionRequest,
  SaveBindingDecisionResponse,
  FetchReservationsRequest,
  FetchReservationsResponse
} from "./provider.js";

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
  requestTimeoutMs: number;
}

export type BridgeRequest =
  | BridgePingRequest
  | BridgeContextRequest
  | AuthCaptureRequest
  | AuthRestoreRequest
  | LoadBindingDecisionsRequest
  | SaveBindingDecisionRequest
  | DeleteBindingDecisionRequest
  | LoadManualScanAnchorsRequest
  | SaveManualScanAnchorsRequest
  | DeleteManualScanAnchorsRequest
  | FetchSheetSnapshotRequest
  | FetchLiveReadBundleRequest
  | FetchProviderRowsRequest
  | FetchReservationsRequest
  | FetchWingsLiveContractRequest
  | DomSnapshotRequest;

export type BridgeSuccessResponse =
  | BridgePingResponse
  | BridgeContextResponse
  | AuthCaptureResponse
  | AuthRestoreResponse
  | LoadBindingDecisionsResponse
  | SaveBindingDecisionResponse
  | DeleteBindingDecisionResponse
  | LoadManualScanAnchorsResponse
  | SaveManualScanAnchorsResponse
  | DeleteManualScanAnchorsResponse
  | FetchSheetSnapshotResponse
  | FetchLiveReadBundleResponse
  | FetchProviderRowsResponse
  | FetchReservationsResponse
  | FetchWingsLiveContractResponse
  | DomSnapshotResponse;

export type BridgeResponse =
  | BridgeSuccessResponse
  | {
      ok: false;
      failure: BridgeFailure;
    };
