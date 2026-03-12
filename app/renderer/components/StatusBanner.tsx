import { useUiStore } from "../state/uiStore";

export function StatusBanner() {
  const bridgeStatus = useUiStore((state) => state.bridgeStatus);
  const sheetRead = useUiStore((state) => state.sheetRead);
  const inventoryCompare = useUiStore((state) => state.inventoryCompare);
  const reservationAudit = useUiStore((state) => state.reservationAudit);
  const activeRunContext = useUiStore((state) => state.activeRunContext);
  const isLiveReady =
    (sheetRead.supportLevel === "read-live" || inventoryCompare.supportLevel === "read-live" || reservationAudit.supportLevel === "read-live") &&
    Boolean(activeRunContext);
  const summary = isLiveReady
    ? `Run ${activeRunContext?.branch || "ALL"} ${activeRunContext?.startDate || "-"}..${activeRunContext?.endDate || "-"} ready.`
    : activeRunContext
      ? `Run requested: sheet ${sheetRead.supportLevel} / inventory ${inventoryCompare.supportLevel} / audit ${reservationAudit.supportLevel}`
      : bridgeStatus.sessionAvailable
        ? "Live workspace available."
        : "Live workspace unavailable.";

  return (
    <section className="status-banner">
      <div>
        <span className="status-kicker">Runtime</span>
        <strong>{bridgeStatus.provider}</strong>
      </div>
      <p>{summary}</p>
    </section>
  );
}
