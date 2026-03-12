export type RuntimeMode = "dry-run" | "replay" | "live";

export type AppOwnedCapability =
  | "workspace-shell"
  | "settings-storage"
  | "inventory-compare"
  | "reservation-audit"
  | "apply-review"
  | "artifact-export"
  | "execution-log";

export type ExtensionOwnedCapability =
  | "session-capture"
  | "active-tab-context"
  | "dom-snapshot"
  | "provider-session-request";

export type BridgeCapability =
  | "bridge.ping"
  | "bridge.getContext"
  | "auth.capture"
  | "auth.restore"
  | "provider.fetchRows"
  | "provider.fetchReservations"
  | "provider.domSnapshot";

export type LiveSupportLevel = "dry-run-only" | "fixture-fallback" | "partial-live" | "read-live" | "apply-live";
