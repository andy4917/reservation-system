export type BridgeErrorCode =
  | "BRIDGE_UNAVAILABLE"
  | "NO_ACTIVE_TAB"
  | "SESSION_MISSING"
  | "AUTH_CAPTURE_FAILED"
  | "AUTH_RESTORE_FAILED"
  | "DOM_EXTRACT_FAILED"
  | "PROVIDER_FETCH_FAILED"
  | "UNSUPPORTED_PROVIDER"
  | "UNKNOWN_ERROR";

export interface BridgeFailure {
  code: BridgeErrorCode;
  message: string;
  retryable: boolean;
  detail?: string;
}
