import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppBranch,
  AppLiveReadSnapshot,
  AppPreflightSnapshot,
  AppProvider,
  AppProviderBrowserState,
  AppReservationAction,
  AppReservationActionSnapshot,
  AppSettingsSnapshot,
  AppShellModule,
} from "../../src/desktop/app-v2-contracts.js";
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
} from "./mockShellData.js";

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
  const [settingsSnapshot, setSettingsSnapshot] = useState<AppSettingsSnapshot | null>(null);
  const [providers, setProviders] = useState<AppProviderBrowserState[]>([]);
  const [preflight, setPreflight] = useState<AppPreflightSnapshot | null>(null);
  const [spreadsheet, setSpreadsheet] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [sheetTabCoexMain, setSheetTabCoexMain] = useState("코엑스");
  const [sheetTabCoexAnnex, setSheetTabCoexAnnex] = useState("코엑스2");
  const [sheetTabGangnam, setSheetTabGangnam] = useState("강남");
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
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<AppBranch>("COEX");
  const [branchSelectionOpen, setBranchSelectionOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<AppShellModule>("pms-read");
  const [activeReservationAction, setActiveReservationAction] = useState<AppReservationAction>("validate");
  const [workspacePhase, setWorkspacePhase] = useState<WorkspacePhase>("idle");
  const [workspaceMessage, setWorkspaceMessage] = useState("준비됨");
  const [windowStart, setWindowStart] = useState(buildDefaultWindow().start);
  const [windowEnd, setWindowEnd] = useState(buildDefaultWindow().end);
  const [reads, setReads] = useState(buildInitialReads("COEX"));
  const [reservationResult, setReservationResult] = useState<AppReservationActionSnapshot | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const previousModuleRef = useRef<AppShellModule>("pms-read");
  const previousActionRef = useRef<AppReservationAction>("validate");

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

  async function refreshPreflight() {
    if (!api?.runPreflight) return;
    const snapshot = await api.runPreflight();
    startTransition(() => {
      setPreflight(snapshot);
      setProviders(snapshot.providers);
    });
  }

  async function bootstrap() {
    if (!api) return;
    await Promise.all([refreshSettings(), refreshProviders(), refreshPreflight()]);
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
      await refreshPreflight();
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

  async function handleLogin() {
    if (!loginId.trim() || !loginPassword.trim()) {
      setWorkspaceMessage("WINGS 아이디와 비밀번호를 입력해 주세요.");
      return;
    }
    setWorkspacePhase("working");
    setBusyKey("login");
    await new Promise((resolve) => setTimeout(resolve, 220));
    setIsLoggedIn(true);
    setBranchSelectionOpen(true);
    setWorkspacePhase("result");
    setWorkspaceMessage("WINGS 로그인에 성공했습니다. PMS 조회에 같은 자격을 사용합니다.");
    setBusyKey(null);
  }

  function handleLogout() {
    setIsLoggedIn(false);
    setBranchSelectionOpen(false);
    setWorkspacePhase("idle");
    setWorkspaceMessage("로그인 화면으로 돌아왔습니다.");
    setReservationResult(null);
    setSelectedReviewId(null);
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
      await refreshPreflight();
      await refreshProviders();
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
      setTimeout(() => {
        setWorkspacePhase("result");
        setWorkspaceMessage(`${RESERVATION_ACTION_LABELS[activeReservationAction]} 결과를 준비했습니다.`);
      }, 220);
    } finally {
      setBusyKey(null);
    }
  }

  function handleModuleChange(module: AppShellModule) {
    if (module === "settings") {
      previousModuleRef.current = activeModule;
      previousActionRef.current = activeReservationAction;
      setPinOpen(true);
      setPinValue("");
      setPinError("");
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

  function confirmBranchSelection() {
    setBranchSelectionOpen(false);
    setWorkspaceMessage(`${selectedBranch} 작업창으로 이동했습니다.`);
  }

  function confirmSettingsPin() {
    if (pinValue !== "0000") {
      setPinError("비밀번호가 맞지 않습니다.");
      return;
    }
    setPinOpen(false);
    setSettingsOpen(true);
    setPinError("");
    setPinValue("");
  }

  function closeSettings() {
    setSettingsOpen(false);
    setActiveModule(previousModuleRef.current);
    setActiveReservationAction(previousActionRef.current);
    setWorkspaceMessage("이전 작업으로 돌아왔습니다.");
  }

  const reservationAvailability = useMemo(() => deriveReservationActionAvailability(reads), [reads]);
  const activeRead = sourceFromModule(activeModule) ? reads[sourceFromModule(activeModule)!] : null;
  const reviewItems = useMemo(
    () => buildReviewQueue(selectedBranch, activeReservationAction, reads, windowStart, windowEnd),
    [activeReservationAction, reads, selectedBranch, windowEnd, windowStart],
  );
  const selectedReview = reviewItems.find((item) => item.id === selectedReviewId) ?? reviewItems[0] ?? null;
  const previewItems = buildPreviewItems(activeRead, selectedBranch);
  const actionOutputRows =
    reservationResult?.action === activeReservationAction && reservationResult.rows.length > 0
      ? reservationResult.rows
      : buildActionOutputRows(activeReservationAction, selectedBranch, windowStart, windowEnd);
  const orderedProviders = ["wings-pms", "naver-partner", "admin-station"]
    .map((provider) => providers.find((candidate) => candidate.provider === provider))
    .filter(Boolean) as AppProviderBrowserState[];

  const reservationSteps = buildActionSteps(activeReservationAction, selectedBranch);

  return (
    <div className="end-user-shell">
      {!isLoggedIn ? (
        <section className="login-shell">
          <div className="login-panel" data-phase={workspacePhase}>
            <div>
              <p className="eyebrow">UHS OPS SHELL</p>
              <h1>WINGS 계정으로 시작</h1>
              <p className="support-copy">처음 로그인한 계정은 PMS 조회에도 그대로 사용합니다.</p>
            </div>
            <label className="field">
              <span>WINGS 아이디</span>
              <input value={loginId} onChange={(event) => setLoginId(event.target.value)} />
            </label>
            <label className="field">
              <span>비밀번호</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button type="button" onClick={() => void handleLogin()} disabled={busyKey !== null}>
                로그인
              </button>
            </div>
            <div className="login-note">{workspaceMessage}</div>
          </div>
        </section>
      ) : (
        <div className="shell-frame">
          <aside className="sidebar">
            <div className="sidebar-block">
              <p className="eyebrow">Branch</p>
              <label className="branch-select">
                <span>지점 선택</span>
                <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value as AppBranch)}>
                  {BRANCH_OPTIONS.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </label>
              <div className="button-row compact-button-row">
                <button type="button" className="ghost-button" onClick={() => setBranchSelectionOpen(true)}>
                  지점 선택으로 돌아가기
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
            <button type="button" className="sidebar-button ghost-sidebar-button" onClick={handleLogout}>
              로그인 화면으로
            </button>
          </aside>

          <main className="workspace">
            <header className="workspace-header">
              <div>
                <p className="workspace-kicker">{selectedBranch}</p>
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
                      disabled={busyKey !== null}
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
                    {reservationResult?.action === activeReservationAction ? reservationResult.summary : buildResultSummary(activeReservationAction, null)}
                  </p>
                  <div className="detail-panel">{windowStart} ~ {windowEnd} / {selectedBranch}</div>
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
                      disabled={!reservationAvailability[activeReservationAction].enabled || busyKey !== null}
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
                        <div className="detail-panel">plan token: {reservationResult.planToken}</div>
                      ) : null}
                    </div>
                  </div>
                </article>
              </section>
            )}
          </main>
        </div>
      )}

      {pinOpen ? (
        <div className="overlay">
          <div className={`pin-modal ${pinError ? "error" : ""}`}>
            <h3>설정 열기</h3>
            <input
              type="password"
              value={pinValue}
              onChange={(event) => setPinValue(event.target.value)}
              maxLength={4}
            />
            {pinError ? <p className="pin-error">{pinError}</p> : null}
            <div className="button-row">
              <button type="button" onClick={confirmSettingsPin}>
                확인
              </button>
              <button type="button" className="ghost-button" onClick={() => setPinOpen(false)}>
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                  <span>기본 조회 기간(일)</span>
                  <input value={reportWindowDays} onChange={(event) => setReportWindowDays(event.target.value)} />
                </label>
                <div className="detail-panel">사용자 기본값은 오늘부터 {reportWindowDays || "5"}일 범위로 열립니다.</div>
                <div className="detail-panel">COEX는 {sheetTabCoexMain} + {sheetTabCoexAnnex}, 강남은 {sheetTabGangnam} 탭을 읽습니다.</div>
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
                <div className="detail-panel">예약번호, 예약키, 이름, 노트 겹침을 기준으로 연박 후보를 read-only로 표시합니다.</div>
                <div className="button-row">
                  <button type="button" onClick={() => void saveSettings()} disabled={busyKey !== null}>
                    옵션 저장
                  </button>
                </div>
              </article>

              <article className="settings-section">
                <h4>BGE-M3 보조 설정</h4>
                <p className="support-copy">매핑/추천 보조 모델은 BGE-M3를 기본값으로 사용합니다.</p>
                <div className="detail-panel">시트 조회, 검증, 오더리스트, 어라이벌에서 추천 후보와 검토 후보를 read-only로 정렬합니다.</div>
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
                <div className="detail-panel">로컬 모델 준비: 1. 경로 입력 2. 활성화 3. 저장 4. 수정/검토 단계에서 보조 상태 확인</div>
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

      {isLoggedIn && branchSelectionOpen ? (
        <div className="overlay">
          <div className="pin-modal branch-picker">
            <h3>지점 선택</h3>
            <p className="support-copy">셸에 들어온 뒤에도 언제든 다시 선택할 수 있습니다.</p>
            <label className="field">
              <span>현재 작업 지점</span>
              <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value as AppBranch)}>
                {BRANCH_OPTIONS.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row">
              <button type="button" onClick={confirmBranchSelection}>
                선택 완료
              </button>
              <button type="button" className="ghost-button" onClick={handleLogout}>
                로그인 화면으로
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
