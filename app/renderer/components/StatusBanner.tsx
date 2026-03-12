import { useUiStore } from "../state/uiStore";

export function StatusBanner() {
  const bridgeStatus = useUiStore((state) => state.bridgeStatus);

  return (
    <section className="status-banner">
      <div>
        <span className="status-kicker">Runtime</span>
        <strong>{bridgeStatus.provider}</strong>
      </div>
      <p>{bridgeStatus.code ? `${bridgeStatus.code} · ${bridgeStatus.message}` : bridgeStatus.message}</p>
    </section>
  );
}
