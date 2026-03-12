import { useUiStore } from "../../state/uiStore";
import { PanelHeading, SectionCard } from "../SurfacePrimitives";

export function SettingsSurface() {
  const providerCards = useUiStore((state) => state.providerCards);
  const bridgeStatus = useUiStore((state) => state.bridgeStatus);
  const bridgeSummary = useUiStore((state) => state.bridgeSummary);
  const jobStatusCards = useUiStore((state) => state.jobStatusCards);
  const authBundleSettingsSnapshot = useUiStore((state) => state.authBundleSettingsSnapshot);
  const recommendationSettings = useUiStore((state) => state.recommendationSettings);
  const recommendationRuntime = useUiStore((state) => state.recommendationRuntime);
  const recommendationRuntimeDiagnostics = useUiStore((state) => state.recommendationRuntimeDiagnostics);
  const recommendationSampleEmbedResult = useUiStore((state) => state.recommendationSampleEmbedResult);
  const setRecommendationEnabled = useUiStore((state) => state.setRecommendationEnabled);
  const updateRecommendationSettings = useUiStore((state) => state.updateRecommendationSettings);
  const warmRecommendationRuntime = useUiStore((state) => state.warmRecommendationRuntime);
  const runRecommendationSampleEmbed = useUiStore((state) => state.runRecommendationSampleEmbed);

  return (
    <div className="settings-surface">
      <SectionCard>
        <PanelHeading
          kicker="Provider Registry"
          title="Capabilities"
          description="앱과 확장이 어느 책임을 나눠 갖는지 provider 단위로 표시합니다."
        />
        <div className="process-grid">
          {providerCards.map((card) => (
            <article key={card.provider} className={`process-card tone-${card.status === "hold" ? "warn" : card.status === "bridge-required" ? "critical" : "ok"}`}>
              <span>{card.owner}</span>
              <strong>{card.label}</strong>
              <p>{card.capabilities.join(", ")}</p>
            </article>
          ))}
        </div>
      </SectionCard>
      <SectionCard>
        <PanelHeading
          kicker="Auth / Info"
          title="Bridge Summary"
          description="확장에서 수집한 인증/정보 요약입니다. 민감한 원문은 여기 노출하지 않습니다."
        />
        <div className="process-grid">
          <article className="process-card tone-ok">
            <span>auth</span>
            <strong>Auth Summary</strong>
            <p>
              cookies {bridgeSummary.authSummary?.cookieCount ?? 0} · bearer {bridgeSummary.authSummary?.hasBearer ? "yes" : "no"} · csrf {bridgeSummary.authSummary?.hasCsrf ? "yes" : "no"} · role {bridgeSummary.authSummary?.hasRole ? "yes" : "no"}
            </p>
          </article>
          <article className="process-card tone-default">
            <span>info</span>
            <strong>Info Summary</strong>
            <p>
              rows {bridgeSummary.infoSummary?.count ?? 0} · channels {(bridgeSummary.infoSummary?.channels || []).join(", ") || "none"}
            </p>
          </article>
        </div>
        <div className="placeholder-panel">
          <h3>Bridge Runtime Summary</h3>
          <p>
            status={bridgeStatus.capability} · write={bridgeStatus.writeEnabled ? "enabled" : "blocked"} · auth={bridgeStatus.authConfigured ? "configured" : "missing"}
          </p>
          <p>{bridgeStatus.code ? `reason=${bridgeStatus.code}` : "reason=none"}</p>
          <p>{bridgeStatus.recoveryAction || "No recovery action required."}</p>
        </div>
        <div className="placeholder-panel">
          <h3>Settings Snapshot</h3>
          <p>
            {authBundleSettingsSnapshot
              ? `${authBundleSettingsSnapshot.provider} @ ${authBundleSettingsSnapshot.host || "unknown host"} saved ${new Date(authBundleSettingsSnapshot.updatedAt).toLocaleString("ko-KR", { hour12: false })}`
              : "No persisted auth bundle snapshot yet."}
          </p>
        </div>
        <div className="placeholder-panel">
          <h3>Current Page Preview</h3>
          <p>
            {bridgeSummary.preview
              ? `${bridgeSummary.preview.title || "untitled"} · ${bridgeSummary.preview.rows.length} candidate rows`
              : "No live page preview captured yet."}
          </p>
          {bridgeSummary.preview ? (
            <p>{(bridgeSummary.preview.rows[0]?.rawLine || bridgeSummary.preview.bodyTextSample || "preview unavailable").slice(0, 160)}</p>
          ) : null}
        </div>
      </SectionCard>
      <SectionCard>
        <PanelHeading
          kicker="Jobs"
          title="Execution Queue"
          description="현재 앱이 판단한 작업 상태입니다."
        />
        <div className="process-grid">
          {jobStatusCards.map((job) => (
            <article key={job.id} className={`process-card tone-${job.status === "blocked" ? "critical" : job.status === "running" ? "ok" : job.status === "ready" ? "default" : "warn"}`}>
              <span>{job.status}</span>
              <strong>{job.title}</strong>
              <p>{job.detail}</p>
            </article>
          ))}
        </div>
      </SectionCard>
      <SectionCard>
        <PanelHeading
          kicker="Recommendation Runtime"
          title="Local Embedder"
          description="원격 모델 다운로드 없이 로컬 모델 경로가 있을 때만 임베딩 런타임을 사용합니다."
        />
        <div className="process-grid">
          <article className={`process-card tone-${recommendationRuntime?.ready ? "ok" : "warn"}`}>
            <span>{recommendationRuntime?.activeRuntime || "unknown"}</span>
            <strong>{recommendationSettings.modelId}</strong>
            <p>
              {(recommendationRuntime?.reason || "Runtime status unavailable.") +
                ` · backend ${recommendationRuntime?.runtimeBackend || "unknown"} · provider ${recommendationRuntime?.runtimeProvider || "unknown"}`}
            </p>
          </article>
          <article className="process-card tone-default">
            <span>path</span>
            <strong>Effective Local Model</strong>
            <p>{recommendationRuntime?.localModelPath || recommendationSettings.localModelPath || "not configured"}</p>
          </article>
          <article className="process-card tone-default">
            <span>threshold</span>
            <strong>Score Threshold</strong>
            <p>{recommendationSettings.scoreThreshold.toFixed(2)} · cache {recommendationSettings.cacheDir || "default"}</p>
          </article>
        </div>
        <div className="placeholder-panel">
          <h3>Recommendation Toggle</h3>
          <p>{recommendationSettings.enabled ? "추천 보조 활성화 상태입니다." : "추천 보조 비활성화 상태입니다."}</p>
          <button type="button" className="action-button" onClick={() => setRecommendationEnabled(!recommendationSettings.enabled)}>
            {recommendationSettings.enabled ? "Disable Assist" : "Enable Assist"}
          </button>
        </div>
        <div className="placeholder-panel">
          <h3>Runtime Warm-up</h3>
          <p>
            {recommendationRuntimeDiagnostics
              ? `warmed=${recommendationRuntimeDiagnostics.warmedUp ? "yes" : "no"} · extractor=${recommendationRuntimeDiagnostics.extractorCached ? "cached" : "cold"} · embeddings=${recommendationRuntimeDiagnostics.embeddingCacheSize}`
              : "Runtime diagnostics unavailable."}
          </p>
          <p>
            {recommendationRuntimeDiagnostics
              ? `variant=${recommendationRuntimeDiagnostics.preflight.resolvedVariant} · quantized=${recommendationRuntimeDiagnostics.preflight.quantizedAvailable ? "yes" : "no"} · full=${recommendationRuntimeDiagnostics.preflight.fullAvailable ? "yes" : "no"}`
              : "Variant resolution unavailable."}
          </p>
          <p>
            {recommendationRuntimeDiagnostics
              ? `resolved path=${recommendationRuntimeDiagnostics.preflight.resolvedModelPath || "none"}`
              : "Resolved path unavailable."}
          </p>
          <p>
            {recommendationRuntimeDiagnostics
              ? `last success=${recommendationRuntimeDiagnostics.lastWarmupSuccessAt ? new Date(recommendationRuntimeDiagnostics.lastWarmupSuccessAt).toLocaleString("ko-KR", { hour12: false }) : "none"} · last failure=${recommendationRuntimeDiagnostics.lastWarmupFailureAt ? new Date(recommendationRuntimeDiagnostics.lastWarmupFailureAt).toLocaleString("ko-KR", { hour12: false }) : "none"}`
              : "Warm-up timestamps unavailable."}
          </p>
          <p>
            {recommendationRuntimeDiagnostics?.lastWarmupFailureCode
              ? `failure code=${recommendationRuntimeDiagnostics.lastWarmupFailureCode} · ${recommendationRuntimeDiagnostics.lastWarmupErrorMessage || "no message"}`
              : recommendationRuntimeDiagnostics?.preflight.message || "No warm-up failure recorded."}
          </p>
          <button type="button" className="action-button" onClick={() => void warmRecommendationRuntime()}>
            Warm-up Retry
          </button>
          <button type="button" className="action-button" onClick={() => void runRecommendationSampleEmbed()}>
            Sample Embed Test
          </button>
          {recommendationSampleEmbedResult ? (
            <p>
              {recommendationSampleEmbedResult.ok
                ? `sample ok · dim ${recommendationSampleEmbedResult.vectorLength} · ${recommendationSampleEmbedResult.text}`
                : `sample failed · ${recommendationSampleEmbedResult.errorCode || "unknown"} · ${recommendationSampleEmbedResult.errorMessage || "no message"}`}
            </p>
          ) : null}
        </div>
        <div className="placeholder-panel">
          <h3>Recommended Usage</h3>
          <p>기본값은 `transformers-js-local` 자동 감지입니다. 로컬 모델 번들이 없으면 lexical fallback으로 내려가며 원격 다운로드는 사용하지 않습니다.</p>
          <label className="settings-field">
            <span>Runtime Preference</span>
            <select
              value={recommendationSettings.runtimePreference}
              onChange={(event) =>
                updateRecommendationSettings({
                  runtimePreference: event.target.value as "transformers-js-local" | "lexical-fallback"
                })
              }
            >
              <option value="lexical-fallback">lexical-fallback</option>
              <option value="transformers-js-local">transformers-js-local</option>
            </select>
          </label>
          <label className="settings-field">
            <span>Model Id</span>
            <input
              value={recommendationSettings.modelId}
              onChange={(event) => updateRecommendationSettings({ modelId: event.target.value })}
              placeholder="intfloat/multilingual-e5-small"
            />
          </label>
          <label className="settings-field">
            <span>Local Model Path</span>
            <input
              value={recommendationSettings.localModelPath}
              onChange={(event) => updateRecommendationSettings({ localModelPath: event.target.value })}
              placeholder="/absolute/path/to/model bundle"
            />
          </label>
          <label className="settings-field">
            <span>Cache Dir</span>
            <input
              value={recommendationSettings.cacheDir}
              onChange={(event) => updateRecommendationSettings({ cacheDir: event.target.value })}
              placeholder="/absolute/path/to/cache"
            />
          </label>
          <label className="settings-field">
            <span>Score Threshold</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={recommendationSettings.scoreThreshold}
              onChange={(event) => updateRecommendationSettings({ scoreThreshold: Number(event.target.value) })}
            />
          </label>
        </div>
      </SectionCard>
    </div>
  );
}
