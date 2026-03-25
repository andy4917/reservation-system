import { startTransition, useEffect, useState } from "react";
import type {
  AppLiveReadSnapshot,
  AppPreflightSnapshot,
  AppProvider,
  AppProviderBrowserState,
  AppReservationActionSnapshot,
  AppSettings,
  AppSettingsSnapshot,
} from "../../src/desktop/app-v2-contracts.js";
import { APP_PROVIDERS } from "../../src/desktop/app-v2-contracts.js";

const EMPTY_CONFIG_JSON = "{}";
const EMPTY_LIVE_READ_INPUT_JSON = "{}";
const EMPTY_RESERVATION_INPUT_JSON = "{}";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(text: string) {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON input must be an object.");
  }
  return parsed as Record<string, unknown>;
}

export default function App() {
  const api = window.desktopApp;
  const [settingsSnapshot, setSettingsSnapshot] = useState<AppSettingsSnapshot | null>(null);
  const [preflight, setPreflight] = useState<AppPreflightSnapshot | null>(null);
  const [providers, setProviders] = useState<AppProviderBrowserState[]>([]);
  const [bundleSnapshot, setBundleSnapshot] = useState<unknown>(null);
  const [readSnapshots, setReadSnapshots] = useState<Partial<Record<"pms" | "ota" | "sheet", AppLiveReadSnapshot>>>({});
  const [reservationSnapshot, setReservationSnapshot] = useState<AppReservationActionSnapshot | null>(null);
  const [configInput, setConfigInput] = useState(EMPTY_CONFIG_JSON);
  const [liveReadInput, setLiveReadInput] = useState(EMPTY_LIVE_READ_INPUT_JSON);
  const [reservationInput, setReservationInput] = useState(EMPTY_RESERVATION_INPUT_JSON);
  const [statusNote, setStatusNote] = useState("Renderer skeleton ready.");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function refreshSettings() {
    if (!api?.loadSettings) return null;
    const snapshot = await api.loadSettings();
    startTransition(() => {
      setSettingsSnapshot(snapshot);
      setConfigInput(formatJson(snapshot.config ?? {}));
    });
    return snapshot;
  }

  async function refreshProviders() {
    if (!api?.listProviderBrowsers) return [];
    const nextProviders = await api.listProviderBrowsers();
    startTransition(() => setProviders(nextProviders));
    return nextProviders;
  }

  async function refreshPreflight() {
    if (!api?.runPreflight) return null;
    const snapshot = await api.runPreflight();
    startTransition(() => setPreflight(snapshot));
    return snapshot;
  }

  async function bootstrap() {
    if (!api) {
      setStatusNote("window.desktopApp is not available.");
      return;
    }
    setBusyKey("bootstrap");
    try {
      await Promise.all([refreshSettings(), refreshProviders(), refreshPreflight()]);
      setStatusNote("Runtime refresh finished.");
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  async function saveSettings() {
    if (!api?.saveSettings) return;
    setBusyKey("save-settings");
    try {
      const payload = parseJsonObject(configInput) as Partial<AppSettings>;
      const snapshot = await api.saveSettings(payload);
      startTransition(() => {
        setSettingsSnapshot(snapshot);
        setConfigInput(formatJson(snapshot.config ?? {}));
      });
      setStatusNote("Settings request finished.");
      await refreshPreflight();
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function installBgeModel() {
    if (!api?.installBgeM3Model) return;
    setBusyKey("install-bge");
    try {
      const snapshot = await api.installBgeM3Model();
      setStatusNote(snapshot.summary);
      await refreshSettings();
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function openProvider(provider: AppProvider) {
    if (!api?.openProviderBrowser) return;
    setBusyKey(`provider:${provider}`);
    try {
      await api.openProviderBrowser(provider);
      setStatusNote("Provider browser request finished.");
      await Promise.all([refreshProviders(), refreshPreflight()]);
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function fetchBundle() {
    if (!api?.fetchLiveReadBundle) return;
    setBusyKey("bundle");
    try {
      const bundle = await api.fetchLiveReadBundle(parseJsonObject(liveReadInput) as never);
      setBundleSnapshot(bundle);
      setStatusNote(bundle.summary);
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function runRead(source: "pms" | "ota" | "sheet") {
    const handler =
      source === "pms" ? api?.runPmsRead : source === "ota" ? api?.runOtaRead : api?.runSheetRead;
    if (!handler) return;
    setBusyKey(`read:${source}`);
    try {
      const snapshot = await handler(parseJsonObject(liveReadInput) as never);
      startTransition(() => {
        setReadSnapshots((current) => ({ ...current, [source]: snapshot }));
      });
      setStatusNote(snapshot.summary);
      await refreshPreflight();
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function runReservationAction() {
    if (!api?.runReservationAction) return;
    setBusyKey("reservation");
    try {
      const snapshot = await api.runReservationAction(parseJsonObject(reservationInput) as never);
      setReservationSnapshot(snapshot);
      setStatusNote(snapshot.summary);
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main className="skeleton-shell">
      <header className="hero">
        <p className="kicker">Frontend Skeleton</p>
        <h1>Desktop runtime shell</h1>
        <p className="lede">The renderer only exposes backend-connected controls, JSON payload entry points, and raw runtime snapshots.</p>
        <div className="hero-actions">
          <button type="button" onClick={() => void bootstrap()} disabled={busyKey !== null}>
            Refresh runtime
          </button>
          <span className="status-note">{statusNote}</span>
        </div>
      </header>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Runtime readiness</p>
              <h2>Preflight</h2>
            </div>
            <button type="button" className="ghost" onClick={() => void refreshPreflight()} disabled={busyKey !== null}>
              Recheck
            </button>
          </div>
          <dl className="kv-list">
            <div>
              <dt>status</dt>
              <dd>{preflight?.overallStatus ?? "-"}</dd>
            </div>
            <div>
              <dt>canRun</dt>
              <dd>{String(preflight?.canRun ?? false)}</dd>
            </div>
            <div>
              <dt>summary</dt>
              <dd>{preflight?.summary ?? "-"}</dd>
            </div>
            <div>
              <dt>checkedAt</dt>
              <dd>{formatDateTime(preflight?.checkedAt)}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Provider sessions</p>
              <h2>Browser runtime</h2>
            </div>
            <button type="button" className="ghost" onClick={() => void refreshProviders()} disabled={busyKey !== null}>
              Refresh
            </button>
          </div>
          <div className="stack">
            {APP_PROVIDERS.map((provider) => {
              const state = providers.find((item) => item.provider === provider);
              return (
                <div key={provider} className="provider-card">
                  <div>
                    <strong>{state?.label ?? provider}</strong>
                    <p>{state?.pageState ?? "idle"} / {state?.windowState ?? "closed"}</p>
                  </div>
                  <button type="button" className="ghost" onClick={() => void openProvider(provider)} disabled={busyKey !== null}>
                    Open
                  </button>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="section-label">Config JSON</p>
              <h2>Settings snapshot</h2>
            </div>
            <div className="button-strip">
              <button type="button" className="ghost" onClick={() => void refreshSettings()} disabled={busyKey !== null}>
                Reload settings
              </button>
              <button type="button" onClick={() => void saveSettings()} disabled={busyKey !== null}>
                Save settings
              </button>
            </div>
          </div>
          <textarea className="json-input" value={configInput} onChange={(event) => setConfigInput(event.target.value)} spellCheck={false} />
          <div className="hero-actions">
            <button type="button" className="ghost" onClick={() => void installBgeModel()} disabled={busyKey !== null}>
              Install BGE-M3
            </button>
            <span className="inline-note">
              configured={String(settingsSnapshot?.isConfigured ?? false)} updatedAt={formatDateTime(settingsSnapshot?.updatedAt)}
            </span>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Live read input</p>
              <h2>Bundle and source reads</h2>
            </div>
          </div>
          <textarea className="json-input" value={liveReadInput} onChange={(event) => setLiveReadInput(event.target.value)} spellCheck={false} />
          <div className="button-strip">
            <button type="button" onClick={() => void fetchBundle()} disabled={busyKey !== null}>
              Fetch bundle
            </button>
            <button type="button" className="ghost" onClick={() => void runRead("pms")} disabled={busyKey !== null}>
              Run pms
            </button>
            <button type="button" className="ghost" onClick={() => void runRead("ota")} disabled={busyKey !== null}>
              Run ota
            </button>
            <button type="button" className="ghost" onClick={() => void runRead("sheet")} disabled={busyKey !== null}>
              Run sheet
            </button>
          </div>
          <pre className="code-block">{formatJson(bundleSnapshot)}</pre>
          <pre className="code-block">{formatJson(readSnapshots)}</pre>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Reservation input</p>
              <h2>Reservation action</h2>
            </div>
          </div>
          <textarea className="json-input" value={reservationInput} onChange={(event) => setReservationInput(event.target.value)} spellCheck={false} />
          <div className="button-strip">
            <button type="button" onClick={() => void runReservationAction()} disabled={busyKey !== null}>
              Run reservation action
            </button>
          </div>
          <pre className="code-block">{formatJson(reservationSnapshot)}</pre>
        </article>
      </section>
    </main>
  );
}
