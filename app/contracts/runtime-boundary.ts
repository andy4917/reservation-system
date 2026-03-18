export type RuntimeMode = "preview" | "history" | "live";

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
  | "provider.fetchSheetSnapshot"
  | "provider.fetchLiveReadBundle"
  | "provider.fetchRows"
  | "provider.fetchReservations"
  | "provider.fetchWingsLiveContract"
  | "provider.domSnapshot";

export type LiveSupportLevel = "preview-only" | "offline-preview" | "partial-live" | "read-live" | "apply-live";
