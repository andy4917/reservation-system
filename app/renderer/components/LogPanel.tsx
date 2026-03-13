import { useUiStore } from "../state/uiStore";

export function LogPanel() {
  const logs = useUiStore((state) => state.logs);
  const visibleLogs = logs.slice(-4);

  return (
    <section className="log-panel">
      <div className="panel-title">최근 기록</div>
      <ul>
        {visibleLogs.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
