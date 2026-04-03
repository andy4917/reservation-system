import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppAuthRequirement,
  AppBranch,
  AppLiveReadSnapshot,
  AppPreflightSnapshot,
  AppProvider,
  AppProviderBrowserState,
  AppReservationAction,
  AppReservationActionSnapshot,
  AppRuntimeVerifySnapshot,
  AppSettingsSnapshot,
  AppShellModule,
} from "../../src/desktop/app-v2-contracts.js";
import { getAppBranchOption } from "../../src/desktop/app-v2-contracts.js";
import {
  buildActionOutputRows,
  buildActionSteps,
  buildPreviewItems,
  buildResultSummary,
  buildReviewQueue,
  BRANCH_OPTIONS,
  createIdleRead,
  deriveReservationActionAvailability,
  RESERVATION_ACTION_LABELS,
} from "./shellState.js";

const MODULE_LABELS: Record<Exclude<AppShellModule, "settings">, string> = {
  "pms-read": "PMS 조회",
  "ota-read": "OTA 조회",
  "sheet-read": "예약 시트 조회",
  "reservation-management": "예약 관리",
};

type WorkspacePhase = "idle" | "working" | "result";

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return toDateInputValue(parsed);
}

function buildDefaultWindow(days = 5) {
  const start = toDateInputValue(new Date());
  return {
    start,
    end: addDays(start, Math.max(days - 1, 0)),
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR");
}

function providerLabel(provider: AppProvider) {
  if (provider === "wings-pms") return "WINGS";
  if (provider === "naver-partner") return "OTA";
  return "STATION";
}

function authModeLabel(mode: AppAuthRequirement["authMode"]) {
  return mode === "config-auth" ? ".env / 설정" : "브라우저 세션";
}

function authStatusLabel(status: AppAuthRequirement["status"]) {
  if (status === "ready") return "준비됨";
  if (status === "needs-settings") return "설정 필요";
  if (status === "needs-auth" || status === "needs-login") return "인증 필요";
  if (status === "attention") return "확인 필요";
  if (status === "missing-sheet") return "시트 누락";
  if (status === "invalid-settings") return "설정 오류";
  return "오류";
}

function sourceFromModule(module: AppShellModule) {
  if (module === "pms-read") return "pms" as const;
  if (module === "ota-read") return "ota" as const;
  if (module === "sheet-read") return "sheet" as const;
  return null;
}

function buildInitialReads(branch: AppBranch) {
  return {
    pms: createIdleRead("pms", branch),
    ota: createIdleRead("ota", branch),
    sheet: createIdleRead("sheet", branch),
  };
}

function buildManagementTitle(action: AppReservationAction) {
  if (action === "compare") return "조회 결과 비교";
  if (action === "validate") return "기준 검증";
  if (action === "reconcile") return "대조 결과 정리";
  if (action === "edit") return "수정 작업";
  if (action === "apply") return "반영 실행";
  if (action === "order-list") return "오더리스트";
  return "어라이벌";
}

export default function App() {
  const [authRequirements, setAuthRequirements] = useState<AppAuthRequirement[]>([]);
  const [settingsSnapshot, setSettingsSnapshot] = useState<AppSettingsSnapshot | null>(null);
  const [providers, setProviders] = useState<AppProviderBrowserState[]>([]);
  const [preflight, setPreflight] = useState<AppPreflightSnapshot | null>(null);
  const [runtimeReadiness, setRuntimeReadiness] = useState<AppRuntimeVerifySnapshot | null>(null);
  const [spreadsheet, setSpreadsheet] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [sheetTabCoexMain, setSheetTabCoexMain] = useState("코엑스");
  const [sheetTabCoexAnnex, setSheetTabCoexAnnex] = useState("코엑스2");
  const [sheetTabGangnam, setSheetTabGangnam] = useState("강남");
  const [sheetTabSeolleung, setSheetTabSeolleung] = useState("선릉");
  const [sheetTabSamsung, setSheetTabSamsung] = useState("삼성");
  const [reportWindowDays, setReportWindowDays] = useState("5");
  const [excludeRoomMakeup, setExcludeRoomMakeup] = useState(false);
  const [flagContinuationCandidates, setFlagContinuationCandidates] = useState(true);
  const [bgeEnabled, setBgeEnabled] = useState(true);
  const [bgeRuntime, setBgeRuntime] = useState<"local-path" | "download-if-missing">("local-path");
  const [bgeModelPath, setBgeModelPath] = useState("");
  const [bgeTopK, setBgeTopK] = useState("5");
  const [bgeScoreThreshold, setBgeScoreThreshold] = useState("0.72");
  const [bgeInstallSummary, setBgeInstallSummary] = useState("BGE-M3 로컬 모델 설치가 필요합니다.");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<AppBranch>("COEX");
  const [activeModule, setActiveModule] = useState<AppShellModule>("pms-read");
  const [activeReservationAction, setActiveReservationAction] = useState<AppReservationAction>("validate");
  const [workspacePhase, setWorkspacePhase] = useState<WorkspacePhase>("idle");
  const [workspaceMessage, setWorkspaceMessage] = useState("준비됨");
  const [windowStart, setWindowStart] = useState(buildDefaultWindow().start);
  const [windowEnd, setWindowEnd] = useState(buildDefaultWindow().end);
  const [reads, setReads] = useState(buildInitialReads("COEX"));
  const [reservationResult, setReservationResult] = useState<AppReservationActionSnapshot | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const previousModuleRef = useRef<AppShellModule>("pms-read");
  const previousActionRef = useRef<AppReservationAction>("validate");
  const autoOpenedProvidersRef = useRef<Set<AppProvider>>(new Set());

  const api = window.desktopApp;

  async function refreshSettings() {
    if (!api?.loadSettings) return;
    const snapshot = await api.loadSettings();
    const nextWindowDays = snapshot.config?.reportWindowDays ?? 5;
    const defaultWindow = buildDefaultWindow(nextWindowDays);
    startTransition(() => {
      setSettingsSnapshot(snapshot);
      setSpreadsheet(snapshot.config?.spreadsheet ?? "");
      setSheetName(snapshot.config?.sheetName ?? "");
      setSheetTabCoexMain(snapshot.config?.sheetTabs?.coexMain ?? "코엑스");
      setSheetTabCoexAnnex(snapshot.config?.sheetTabs?.coexAnnex ?? "코엑스2");
      setSheetTabGangnam(snapshot.config?.sheetTabs?.gangnam ?? "강남");
      setSheetTabSeolleung(snapshot.config?.sheetTabs?.seolleung ?? "선릉");
      setSheetTabSamsung(snapshot.config?.sheetTabs?.samsung ?? "삼성");
      setReportWindowDays(String(nextWindowDays));
      setExcludeRoomMakeup(snapshot.config?.opsView?.excludeRoomMakeup ?? false);
      setFlagContinuationCandidates(snapshot.config?.opsView?.flagContinuationCandidates ?? true);
      setBgeEnabled(snapshot.config?.bgeM3?.enabled ?? true);
      setBgeRuntime(snapshot.config?.bgeM3?.runtime ?? "local-path");
      setBgeModelPath(snapshot.config?.bgeM3?.modelPath ?? "");
      setBgeTopK(String(snapshot.config?.bgeM3?.topK ?? 5));
      setBgeScoreThreshold(String(snapshot.config?.bgeM3?.scoreThreshold ?? 0.72));
      setBgeInstallSummary(snapshot.config?.bgeM3?.modelPath ? "BGE-M3 로컬 모델 경로가 저장되어 있습니다." : "BGE-M3 로컬 모델 설치가 필요합니다.");
      setWindowStart(defaultWindow.start);
      setWindowEnd(defaultWindow.end);
    });
  }

  async function refreshProviders() {
    if (!api?.listProviderBrowsers) return;
    const nextProviders = await api.listProviderBrowsers();
    startTransition(() => setProviders(nextProviders));
  }

  async function refreshAuthRequirements() {
    if (!api?.listAuthRequirements) return;
    const nextRequirements = await api.listAuthRequirements();
    startTransition(() => setAuthRequirements(nextRequirements));
  }

  async function refreshPreflight() {
    if (!api?.runPreflight) return;
    const snapshot = await api.runPreflight();
    startTransition(() => {
      setPreflight(snapshot);
      setProviders(snapshot.providers);
    });
  }

  async function refreshRuntimeReadiness() {
    if (!api?.getRuntimeReadiness) return;
    const snapshot = await api.getRuntimeReadiness("live-read");
    startTransition(() => {
      setRuntimeReadiness(snapshot);
      setPreflight(snapshot.preflight);
      setProviders(snapshot.preflight?.providers ?? []);
    });
  }

  async function bootstrap() {
    if (!api) return;
    await Promise.all([refreshSettings(), refreshProviders(), refreshPreflight(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
  }

  useEffect(() => {
    document.body.dataset.appShell = "end-user";
    void bootstrap();
  }, []);

  useEffect(() => {
    setReads(buildInitialReads(selectedBranch));
    setWorkspacePhase("idle");
    setWorkspaceMessage(`${selectedBranch} 작업을 준비했습니다.`);
    setReservationResult(null);
    setSelectedReviewId(null);
  }, [selectedBranch]);

  async function saveSettings() {
    if (!api?.saveSettings) return;
    setBusyKey("save-settings");
    try {
      const nextSnapshot = await api.saveSettings({
        spreadsheet,
        sheetName,
        sheetTabs: {
          coexMain: sheetTabCoexMain,
          coexAnnex: sheetTabCoexAnnex,
          gangnam: sheetTabGangnam,
          seolleung: sheetTabSeolleung,
          samsung: sheetTabSamsung,
        },
        opsView: {
          excludeRoomMakeup,
          flagContinuationCandidates,
        },
        reportWindowDays: Number(reportWindowDays),
        bgeM3: {
          enabled: bgeEnabled,
          modelId: "Xenova/bge-m3",
          runtime: bgeRuntime,
          modelPath: bgeModelPath,
          topK: Number(bgeTopK),
          scoreThreshold: Number(bgeScoreThreshold),
        },
      });
      startTransition(() => setSettingsSnapshot(nextSnapshot));
      setWorkspaceMessage("설정을 저장했습니다. 다음 조회부터 같은 기준을 사용합니다.");
      const defaultWindow = buildDefaultWindow(Number(reportWindowDays));
      setWindowStart(defaultWindow.start);
      setWindowEnd(defaultWindow.end);
      await Promise.all([refreshPreflight(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
    } finally {
      setBusyKey(null);
    }
  }

  async function installBgeM3Model() {
    if (!api?.installBgeM3Model) return;
    setBusyKey("install-bge-m3");
    setWorkspacePhase("working");
    setWorkspaceMessage("BGE-M3 로컬 모델을 설치 중입니다.");
    try {
      const snapshot = await api.installBgeM3Model();
      setBgeEnabled(true);
      setBgeRuntime("local-path");
      setBgeModelPath(snapshot.modelPath);
      setBgeInstallSummary(snapshot.summary);
      setWorkspacePhase("result");
      setWorkspaceMessage(snapshot.summary);
      await refreshSettings();
    } catch (error) {
      setBgeInstallSummary("BGE-M3 설치에 실패했습니다.");
      setWorkspacePhase("result");
      setWorkspaceMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function openProviderSession(provider: AppProvider) {
    if (!api?.openProviderBrowser) return;
    setBusyKey(`provider:${provider}`);
    setWorkspacePhase("working");
    setWorkspaceMessage(`${providerLabel(provider)} 브라우저 세션 창을 여는 중입니다.`);
    try {
      await api.openProviderBrowser(provider);
      await Promise.all([refreshProviders(), refreshPreflight(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
      setWorkspacePhase("result");
      setWorkspaceMessage(`${providerLabel(provider)} 창을 열었습니다. 로그인 후 상태를 새로고침해 주세요.`);
    } finally {
      setBusyKey(null);
    }
  }

  async function reloadProviderSession(provider: AppProvider) {
    if (!api?.reloadProviderBrowser) return;
    setBusyKey(`provider-reload:${provider}`);
    setWorkspacePhase("working");
    setWorkspaceMessage(`${providerLabel(provider)} 세션 상태를 다시 확인하는 중입니다.`);
    try {
      await api.reloadProviderBrowser(provider);
      await Promise.all([refreshProviders(), refreshPreflight(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
      setWorkspacePhase("result");
      setWorkspaceMessage(`${providerLabel(provider)} 세션 상태를 새로고침했습니다.`);
    } finally {
      setBusyKey(null);
    }
  }

  async function runRead(module: Extract<AppShellModule, "pms-read" | "ota-read" | "sheet-read">) {
    if (!api) return;
    const source = sourceFromModule(module);
    if (!source) return;
    setBusyKey(module);
    setWorkspacePhase("working");
    setWorkspaceMessage(`${MODULE_LABELS[module]} 작업을 진행 중입니다.`);
    try {
      const result =
        module === "pms-read"
          ? await api.runPmsRead({ branch: selectedBranch, startDate: windowStart, endDate: windowEnd })
          : module === "ota-read"
            ? await api.runOtaRead({ branch: selectedBranch, startDate: windowStart, endDate: windowEnd })
            : await api.runSheetRead({ branch: selectedBranch, startDate: windowStart, endDate: windowEnd });
      startTransition(() => {
        setReads((current) => ({ ...current, [source]: result }));
        setSelectedReviewId(result.items[0]?.id ?? null);
        setWorkspacePhase("result");
        setWorkspaceMessage(result.summary);
      });
      await Promise.all([refreshPreflight(), refreshProviders(), refreshAuthRequirements(), refreshRuntimeReadiness()]);
    } finally {
      setBusyKey(null);
    }
  }

  async function executeReservationAction() {
    setBusyKey(`reservation:${activeReservationAction}`);
    setWorkspacePhase("working");
    setWorkspaceMessage(`${RESERVATION_ACTION_LABELS[activeReservationAction]} 작업을 진행 중입니다.`);
    try {
      if (api?.runReservationAction) {
        const result = await api.runReservationAction({
          action: activeReservationAction,
          branch: selectedBranch,
          startDate: windowStart,
          endDate: windowEnd,
          excludeRoomMakeup,
          flagContinuationCandidates,
        });
        startTransition(() => {
          setReservationResult(result);
          setWorkspacePhase("result");
          setWorkspaceMessage(result.summary);
          setSelectedReviewId(result.rows[0]?.id ?? selectedReviewId);
        });
        return;
      }
      setWorkspacePhase("result");
      setWorkspaceMessage("예약 관리 IPC가 연결되지 않았습니다. 결과를 생성하지 않았습니다.");
    } finally {
      setBusyKey(null);
    }
  }

  function handleModuleChange(module: AppShellModule) {
    if (module === "settings") {
      previousModuleRef.current = activeModule;
      previousActionRef.current = activeReservationAction;
      setSettingsOpen(true);
      setWorkspaceMessage("설정을 열었습니다.");
      return;
    }
    setActiveModule(module);
    setWorkspacePhase("idle");
    setReservationResult(null);
    setSelectedReviewId(null);
  }

  function handleReservationAction(action: AppReservationAction, enabled: boolean) {
    if (!enabled) return;
    setActiveModule("reservation-management");
    setActiveReservationAction(action);
    setWorkspacePhase("idle");
    setReservationResult(null);
    setWorkspaceMessage(`${RESERVATION_ACTION_LABELS[action]} 화면을 준비했습니다.`);
  }

  function closeSettings() {
    setSettingsOpen(false);
    setActiveModule(previousModuleRef.current);
    setActiveReservationAction(previousActionRef.current);
    setWorkspaceMessage("이전 작업으로 돌아왔습니다.");
  }

  const branchOption = useMemo(() => getAppBranchOption(selectedBranch), [selectedBranch]);
  const reservationAvailability = useMemo(() => deriveReservationActionAvailability(reads, selectedBranch), [reads, selectedBranch]);
  const activeRead = sourceFromModule(activeModule) ? reads[sourceFromModule(activeModule)!] : null;
  const reviewItems = useMemo(
    () => buildReviewQueue(selectedBranch, activeReservationAction, reads, reservationResult, windowStart, windowEnd),
    [activeReservationAction, reads, reservationResult, selectedBranch, windowEnd, windowStart],
  );
  const selectedReview = reviewItems.find((item) => item.id === selectedReviewId) ?? reviewItems[0] ?? null;
  const previewItems = buildPreviewItems(activeRead, selectedBranch);
  const actionOutputRows = buildActionOutputRows(activeReservationAction, selectedBranch, windowStart, windowEnd, reservationResult);
  const orderedProviders = ["wings-pms", "naver-partner", "admin-station"]
    .map((provider) => providers.find((candidate) => candidate.provider === provider))
    .filter(Boolean) as AppProviderBrowserState[];
  const authBlockingRequirements = authRequirements.filter((item) => !item.ready);
  const configAuthRequirements = authBlockingRequirements.filter((item) => item.authMode === "config-auth");
  const sessionAuthRequirements = authBlockingRequirements.filter((item) => item.authMode === "session-auth");

  const reservationSteps = buildActionSteps(activeReservationAction, selectedBranch);

  useEffect(() => {
    const nextProvider = sessionAuthRequirements.find(
      (item) =>
        (item.status === "needs-login" || item.status === "attention") &&
        !autoOpenedProvidersRef.current.has(item.target as AppProvider),
    );
    if (!nextProvider) return;
    autoOpenedProvidersRef.current.add(nextProvider.target as AppProvider);
    void openProviderSession(nextProvider.target as AppProvider);
  }, [sessionAuthRequirements]);

  return (
    <div className="end-user-shell">
      <div className="shell-frame">
          <aside className="sidebar">
            <div className="sidebar-block">
              <p className="eyebrow">Branch</p>
              <label className="branch-select">
                <span>지점 선택</span>
                <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value as AppBranch)}>
                  {BRANCH_OPTIONS.map((branch) => (
                    <option key={branch.branch} value={branch.branch} disabled={branch.availability !== "active"}>
                      {branch.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="detail-panel">{branchOption.reason}</div>
              <div className="button-row compact-button-row">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void Promise.all([refreshAuthRequirements(), refreshRuntimeReadiness(), refreshPreflight()])}
                >
                  전체 상태 새로고침
                </button>
              </div>
            </div>

            <div className="sidebar-block">
              {(Object.keys(MODULE_LABELS) as Array<Exclude<AppShellModule, "settings">>).map((module) => (
                <button
                  key={module}
                  type="button"
                  className={`sidebar-button ${activeModule === module ? "active" : ""}`}
                  onClick={() => handleModuleChange(module)}
                >
                  {MODULE_LABELS[module]}
                </button>
              ))}
              <div className="submenu">
                {(Object.keys(RESERVATION_ACTION_LABELS) as AppReservationAction[]).map((action) => {
                  const state = reservationAvailability[action];
                  return (
                    <button
                      key={action}
                      type="button"
                      className={`submenu-button ${activeReservationAction === action ? "active" : ""}`}
                      onClick={() => handleReservationAction(action, state.enabled)}
                      disabled={!state.enabled}
                      title={state.reason}
                    >
                      {RESERVATION_ACTION_LABELS[action]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sidebar-block read-badges">
              <span data-status={reads.pms.status}>PMS</span>
              <span data-status={reads.ota.status}>OTA</span>
              <span data-status={reads.sheet.status}>SHEET</span>
            </div>

            <button type="button" className="sidebar-button settings-button" onClick={() => handleModuleChange("settings")}>
              설정
            </button>
            <button
              type="button"
              className="sidebar-button ghost-sidebar-button"
              onClick={() => void Promise.all([refreshAuthRequirements(), refreshRuntimeReadiness(), refreshPreflight()])}
            >
              인증 상태 새로고침
            </button>
          </aside>

          <main className="workspace">
            <header className="workspace-header">
              <div>
                <p className="workspace-kicker">{branchOption.label}</p>
                <h2>{activeModule === "reservation-management" ? buildManagementTitle(activeReservationAction) : MODULE_LABELS[activeModule as Exclude<AppShellModule, "settings">]}</h2>
              </div>
              <div className="workspace-header-tools">
                <label className="compact-field">
                  <span>조회 기간</span>
                  <input type="date" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} />
                </label>
                <label className="compact-field">
                  <span>종료일</span>
                  <input type="date" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} />
                </label>
                <button type="button" className="ghost-button" onClick={() => {
                  const next = buildDefaultWindow(5);
                  setWindowStart(next.start);
                  setWindowEnd(next.end);
                }}>
                  오늘부터 5일
                </button>
                <div className="workspace-status">{workspaceMessage}</div>
              </div>
            </header>

            <section className="auth-banner">
              <div className="auth-banner-header">
                <div>
                  <p className="eyebrow">인증 안내</p>
                  <h3>앱은 바로 사용 가능하지만, live-read는 필요한 인증이 준비돼야 열립니다.</h3>
                </div>
                <div className="detail-panel">
                  live-read: {runtimeReadiness?.supportLevel ?? "unknown"} / blocking: {runtimeReadiness?.blockingSources.join(", ") || "-"}
                </div>
              </div>
              {authBlockingRequirements.length === 0 ? (
                <div className="detail-panel">현재 필요한 추가 인증이 없습니다. 그대로 조회를 진행하면 됩니다.</div>
              ) : (
                <div className="auth-card-grid inline-auth-card-grid">
                  {configAuthRequirements.length > 0 ? <p className="section-title">환경 인증</p> : null}
                  {configAuthRequirements.map((requirement) => (
                    <article key={requirement.target} className="auth-card compact-auth-card">
                      <div className="auth-card-header">
                        <strong>{requirement.label}</strong>
                        <span>{authStatusLabel(requirement.status)}</span>
                      </div>
                      <div className="detail-panel">{authModeLabel(requirement.authMode)}</div>
                      <p className="support-copy">{requirement.nextAction}</p>
                      <div className="auth-chip-row">
                        {requirement.hints.map((hint) => (
                          <span key={hint} className="auth-chip">{hint}</span>
                        ))}
                      </div>
                    </article>
                  ))}
                  {sessionAuthRequirements.length > 0 ? <p className="section-title">브라우저 세션 인증</p> : null}
                  {sessionAuthRequirements.map((requirement) => (
                    <article key={requirement.target} className="auth-card compact-auth-card">
                      <div className="auth-card-header">
                        <strong>{requirement.label}</strong>
                        <span>{authStatusLabel(requirement.status)}</span>
                      </div>
                      <div className="detail-panel">{authModeLabel(requirement.authMode)}</div>
                      <p className="support-copy">{requirement.nextAction}</p>
                      <div className="auth-chip-row">
                        {requirement.evidence.map((item) => (
                          <span key={item} className="auth-chip">{item}</span>
                        ))}
                      </div>
                      <div className="button-row">
                        <button
                          type="button"
                          onClick={() => void openProviderSession(requirement.target as AppProvider)}
                          disabled={busyKey !== null}
                        >
                          Provider 창 열기
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => void reloadProviderSession(requirement.target as AppProvider)}
                          disabled={busyKey !== null}
                        >
                          상태 새로고침
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {activeModule !== "reservation-management" && activeRead ? (
              <section className="workspace-grid" data-phase={workspacePhase}>
                <article className="hero-card">
                  <p className="eyebrow">{MODULE_LABELS[activeModule as Extract<AppShellModule, "pms-read" | "ota-read" | "sheet-read">]}</p>
                  <h3>{activeRead.summary}</h3>
                  <p className="support-copy">
                    {activeRead.status === "done"
                      ? `${activeRead.recordsImported}건을 가져왔습니다. ${windowStart} ~ ${windowEnd}`
                      : "먼저 읽기 작업을 시작해 주세요."}
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={() => void runRead(activeModule as Extract<AppShellModule, "pms-read" | "ota-read" | "sheet-read">)}
                      disabled={busyKey !== null || branchOption.availability !== "active"}
                    >
                      {MODULE_LABELS[activeModule as Extract<AppShellModule, "pms-read" | "ota-read" | "sheet-read">]} 시작
                    </button>
                  </div>
                </article>

                <article className="progress-card">
                  <p className="section-title">진행</p>
                  {buildActionSteps(
                    activeModule === "pms-read" ? "validate" : activeModule === "ota-read" ? "compare" : "reconcile",
                    selectedBranch,
                  ).map((step, index) => (
                    <div key={step} className={`step-row ${workspacePhase === "working" && index === 1 ? "current" : ""}`}>
                      <span>{index + 1}</span>
                      <strong>{step}</strong>
                    </div>
                  ))}
                </article>

                <article className="list-card">
                  <p className="section-title">결과 미리보기</p>
                  {buildPreviewItems(activeRead, selectedBranch).map((item) => (
                    <div key={item.id} className="list-row">
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.subtitle}</span>
                      </div>
                      <em>{item.statusLabel}</em>
                    </div>
                  ))}
                </article>
              </section>
            ) : (
              <section className="workspace-grid" data-phase={workspacePhase}>
                <article className="hero-card">
                  <p className="eyebrow">예약 관리</p>
                  <h3>{buildManagementTitle(activeReservationAction)}</h3>
                  <p className="support-copy">
                    {buildResultSummary(activeReservationAction, reservationResult)}
                  </p>
                  <div className="detail-panel">{windowStart} ~ {windowEnd} / {branchOption.label}</div>
                  <div className="step-chip-row">
                    {(Object.keys(RESERVATION_ACTION_LABELS) as AppReservationAction[]).map((action) => (
                      <span
                        key={action}
                        className={`step-chip ${activeReservationAction === action ? "active" : ""} ${reservationAvailability[action].enabled ? "" : "locked"}`}
                      >
                        {RESERVATION_ACTION_LABELS[action]}
                      </span>
                    ))}
                  </div>
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={() => void executeReservationAction()}
                      disabled={!reservationAvailability[activeReservationAction].enabled || busyKey !== null || branchOption.availability !== "active"}
                    >
                      {activeReservationAction === "order-list" || activeReservationAction === "arrival"
                        ? `${RESERVATION_ACTION_LABELS[activeReservationAction]} 생성`
                        : `${RESERVATION_ACTION_LABELS[activeReservationAction]} 시작`}
                    </button>
                  </div>
                  {activeReservationAction === "order-list" ||
                  activeReservationAction === "arrival" ||
                  activeReservationAction === "validate" ||
                  activeReservationAction === "edit" ? (
                    <div className="toggle-stack">
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={excludeRoomMakeup}
                          onChange={(event) => setExcludeRoomMakeup(event.target.checked)}
                        />
                        <span>룸메이크업 제외</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={flagContinuationCandidates}
                          onChange={(event) => setFlagContinuationCandidates(event.target.checked)}
                        />
                        <span>연박 후보 표시</span>
                      </label>
                    </div>
                  ) : null}
                </article>

                <article className="progress-card">
                  <p className="section-title">작업 단계</p>
                  {reservationSteps.map((step, index) => (
                    <div key={step} className={`step-row ${workspacePhase === "working" && index === 1 ? "current" : ""}`}>
                      <span>{index + 1}</span>
                      <strong>{step}</strong>
                    </div>
                  ))}
                  <div className="availability-note">{reservationAvailability[activeReservationAction].reason}</div>
                </article>

                <article className="review-card">
                  <p className="section-title">검토 목록</p>
                  <div className="review-grid">
                    <div className="review-list">
                      {reviewItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`review-item ${selectedReview?.id === item.id ? "active" : ""}`}
                          onClick={() => setSelectedReviewId(item.id)}
                        >
                          <strong>{item.title}</strong>
                          <span>{item.subtitle}</span>
                        </button>
                      ))}
                    </div>
                    <div className="review-detail">
                      <h4>{selectedReview?.title ?? "-"}</h4>
                      <p>{selectedReview?.subtitle ?? "검토할 항목을 선택해 주세요."}</p>
                      <div className="detail-panel">
                        {selectedReview?.status === "warning" ? "즉시 확인 필요" : selectedReview?.status === "ready" ? "반영 가능" : "비교용 정보"}
                      </div>
                      <div className="action-output-list">
                        {actionOutputRows.map((row) => (
                          <div key={row.id} className="list-row">
                            <div>
                              <strong>{row.primary}</strong>
                              <span>{row.secondary}</span>
                              {row.detail ? <small>{row.detail}</small> : null}
                            </div>
                            <em>{row.statusLabel}</em>
                          </div>
                        ))}
                      </div>
                      {reservationResult?.outputPath ? (
                        <div className="detail-panel">output: {reservationResult.outputPath}</div>
                      ) : null}
                      {reservationResult?.engineStatus === "pending-source" ? (
                        <div className="detail-panel">source bundle 필요: compare/reconcile/apply 엔진은 준비되었고 PMS/OTA raw source records 연결만 남았습니다.</div>
                      ) : null}
                      {reservationResult?.planToken ? (
                        <div className="detail-panel">승인 토큰이 생성되었습니다. raw 값은 UI에 노출하지 않습니다.</div>
                      ) : null}
                    </div>
                  </div>
                </article>
              </section>
            )}
          </main>
        </div>

      {settingsOpen ? (
        <div className="overlay overlay-settings">
          <section className="settings-panel">
            <div className="settings-header">
              <div>
                <p className="eyebrow">Settings</p>
                <h3>설정</h3>
              </div>
              <button type="button" className="ghost-button" onClick={closeSettings}>
                닫기
              </button>
            </div>

            <div className="settings-grid">
              <article className="settings-section">
                <h4>라이브 조회 설정</h4>
                <label className="field">
                  <span>Spreadsheet ID / URL</span>
                  <input value={spreadsheet} onChange={(event) => setSpreadsheet(event.target.value)} />
                </label>
                <label className="field">
                  <span>Sheet Name</span>
                  <input value={sheetName} onChange={(event) => setSheetName(event.target.value)} />
                </label>
                <label className="field">
                  <span>코엑스(B동)</span>
                  <input value={sheetTabCoexMain} onChange={(event) => setSheetTabCoexMain(event.target.value)} />
                </label>
                <label className="field">
                  <span>코엑스2(A동)</span>
                  <input value={sheetTabCoexAnnex} onChange={(event) => setSheetTabCoexAnnex(event.target.value)} />
                </label>
                <label className="field">
                  <span>강남</span>
                  <input value={sheetTabGangnam} onChange={(event) => setSheetTabGangnam(event.target.value)} />
                </label>
                <label className="field">
                  <span>선릉</span>
                  <input value={sheetTabSeolleung} onChange={(event) => setSheetTabSeolleung(event.target.value)} />
                </label>
                <label className="field">
                  <span>삼성</span>
                  <input value={sheetTabSamsung} onChange={(event) => setSheetTabSamsung(event.target.value)} />
                </label>
                <label className="field">
                  <span>기본 조회 기간(일)</span>
                  <input value={reportWindowDays} onChange={(event) => setReportWindowDays(event.target.value)} />
                </label>
                <div className="detail-panel">사용자 기본값은 오늘부터 {reportWindowDays || "5"}일 범위로 열립니다.</div>
                <div className="detail-panel">COEX는 {sheetTabCoexMain} + {sheetTabCoexAnnex}, 강남은 {sheetTabGangnam}, 선릉은 {sheetTabSeolleung} 탭을 읽습니다.</div>
                <div className="detail-panel">삼성은 preopen 상태로 유지되며 truth mapping 대상만 유지합니다.</div>
                <div className="button-row">
                  <button type="button" onClick={() => void saveSettings()} disabled={busyKey !== null}>
                    저장
                  </button>
                </div>
              </article>

              <article className="settings-section">
                <h4>오더리스트 / 어라이벌 옵션</h4>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={excludeRoomMakeup}
                    onChange={(event) => setExcludeRoomMakeup(event.target.checked)}
                  />
                  <span>룸메이크업 제외</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={flagContinuationCandidates}
                    onChange={(event) => setFlagContinuationCandidates(event.target.checked)}
                  />
                  <span>연박 후보 표시</span>
                </label>
                <div className="detail-panel">하이브리드 검색이 예약번호, 예약키, 이름, 연락처, 채널, 노트 겹침, 날짜 인접성을 함께 사용해 연박 후보를 찾습니다.</div>
                <div className="detail-panel">결과 단계는 확정 / 수정 추천 / 검토 / 보류이며, 근거 충돌 시 보류로 남깁니다.</div>
                <div className="button-row">
                  <button type="button" onClick={() => void saveSettings()} disabled={busyKey !== null}>
                    옵션 저장
                  </button>
                </div>
              </article>

              <article className="settings-section">
                <h4>BGE-M3 보조 설정</h4>
                <p className="support-copy">매핑/추천 보조 모델은 BGE-M3를 기본값으로 사용합니다.</p>
                <div className="detail-panel">시트 조회, 검증, 오더리스트, 어라이벌에서 하이브리드 검색이 후보를 만들고 BGE-M3가 규칙 근거가 정리된 후보만 보조 정렬합니다.</div>
                <div className="detail-panel">BGE-M3는 충돌 근거를 무시하지 않으며, 약한 근거는 보류로 남깁니다.</div>
                <label className="field">
                  <span>사용 여부</span>
                  <select value={bgeEnabled ? "on" : "off"} onChange={(event) => setBgeEnabled(event.target.value === "on")}>
                    <option value="on">활성화</option>
                    <option value="off">비활성화</option>
                  </select>
                </label>
                <label className="field">
                  <span>실행 모드</span>
                  <select value={bgeRuntime} onChange={(event) => setBgeRuntime(event.target.value as "local-path" | "download-if-missing")}>
                    <option value="local-path">로컬 경로</option>
                    <option value="download-if-missing">없으면 내려받기</option>
                  </select>
                </label>
                <label className="field">
                  <span>모델 경로</span>
                  <input
                    value={bgeModelPath}
                    onChange={(event) => setBgeModelPath(event.target.value)}
                  />
                </label>
                <div className="detail-panel">{bgeInstallSummary}</div>
                <label className="field">
                  <span>Top K</span>
                  <input value={bgeTopK} onChange={(event) => setBgeTopK(event.target.value)} />
                </label>
                <label className="field">
                  <span>Score Threshold</span>
                  <input value={bgeScoreThreshold} onChange={(event) => setBgeScoreThreshold(event.target.value)} />
                </label>
                <div className="detail-panel">로컬 모델 준비: 1. 경로 입력 2. 활성화 3. 저장 4. 하이브리드 검색 결과에서 수정 추천/검토/보류 상태 확인</div>
                <div className="detail-panel">Xenova/bge-m3 / {bgeRuntime} / {bgeModelPath ? "path-set" : "path-missing"}</div>
                <div className="button-row">
                  <button type="button" onClick={() => void installBgeM3Model()} disabled={busyKey !== null}>
                    BGE-M3 설치
                  </button>
                  <button type="button" onClick={() => void saveSettings()} disabled={busyKey !== null}>
                    BGE-M3 저장
                  </button>
                </div>
              </article>

              <article className="settings-section">
                <h4>고급 / 진단</h4>
                <div className="provider-diagnostics">
                  {orderedProviders.map((provider) => (
                    <div key={provider.provider} className="diagnostic-card">
                      <strong>{providerLabel(provider.provider)}</strong>
                      <span>{provider.pageState}</span>
                      <span>{provider.currentHost ?? "-"}</span>
                      <span>{provider.providerCookieCount} cookies</span>
                    </div>
                  ))}
                </div>
                <div className="detail-panel">
                  preflight: {preflight?.overallStatus ?? "idle"} / checked: {formatDateTime(preflight?.checkedAt ?? null)}
                </div>
                <div className="detail-panel">
                  previousWorkspace: {previousModuleRef.current} / action: {previousActionRef.current}
                </div>
              </article>

              <article className="settings-section">
                <h4>현재 저장 상태</h4>
                <div className="detail-panel">
                  configured: {settingsSnapshot?.isConfigured ? "yes" : "no"} / updated: {formatDateTime(settingsSnapshot?.updatedAt ?? null)}
                </div>
              </article>
            </div>
          </section>
        </div>
      ) : null}

    </div>
  );
}
