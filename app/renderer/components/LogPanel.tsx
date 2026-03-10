import { useUiStore } from "../state/uiStore";

export function LogPanel() {
  const logs = useUiStore((state) => state.logs);

  return (
    <section className="log-panel">
      <div className="panel-title">Execution Log</div>
      <ul>
        {logs.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
