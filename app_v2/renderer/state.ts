import { startTransition, useEffect, useMemo, useState } from "react";
import type {
  AppBranch,
  AppLiveReadBundleSnapshot,
  AppLiveReadSnapshot,
  AppProvider,
  AppPreflightSnapshot,
  AppReadSource,
  AppReservationAction,
  AppReservationActionSnapshot,
  AppSettings,
  AppSettingsSnapshot,
  AppSheetTabSettings,
} from "../../src/desktop/app-v2-contracts.js";
import { requireDesktopAppApi } from "./api.js";
import {
  ACTION_OPTIONS,
  BRANCH_OPTIONS,
  EMPTY_SHEET_TABS,
  PROVIDER_ORDER,
  SIDEBAR_MENUS,
  SidebarMenu,
  countBundleRows,
  type DisplayState,
  getActionDisplay,
  getActionLockReason,
  getBundleDisplay,
  getProviderDisplay,
  getResultDisplay,
  getSourceDisplay,
  isConfirmReady,
} from "./model.js";

interface SettingsFormState {
  spreadsheet: string;
  sheetTabs: AppSheetTabSettings;
}

interface DateRangeState {
  startDate: string;
  endDate: string;
}

interface MenuNoteState {
  session: string | null;
  read: string | null;
  work: string | null;
  result: string | null;
}

function normalizeError(_error: unknown) {
  return "오류";
}

function emptyMenuNotes(): MenuNoteState {
  return {
    session: null,
    read: null,
    work: null,
    result: null,
  };
}

function toSettingsForm(snapshot: AppSettingsSnapshot | null): SettingsFormState {
  return {
    spreadsheet: snapshot?.config?.spreadsheet ?? "",
    sheetTabs: {
      ...EMPTY_SHEET_TABS,
      ...(snapshot?.config?.sheetTabs ?? {}),
    },
  };
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function useAppWorkbench() {
  const [activeMenu, setActiveMenu] = useState<SidebarMenu>("session");
  const [selectedBranch, setSelectedBranch] = useState<AppBranch | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeState>({ startDate: "", endDate: "" });
  const [selectedAction, setSelectedAction] = useState<AppReservationAction>("compare");
  const [selectedResultRowId, setSelectedResultRowId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSnapshot, setSettingsSnapshot] = useState<AppSettingsSnapshot | null>(null);
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>({ spreadsheet: "", sheetTabs: EMPTY_SHEET_TABS });
  const [preflight, setPreflight] = useState<AppPreflightSnapshot | null>(null);
  const [bundleSnapshot, setBundleSnapshot] = useState<AppLiveReadBundleSnapshot | null>(null);
  const [sourceSnapshots, setSourceSnapshots] = useState<Partial<Record<AppReadSource, AppLiveReadSnapshot>>>({});
  const [actionSnapshot, setActionSnapshot] = useState<AppReservationActionSnapshot | null>(null);
  const [busyMenu, setBusyMenu] = useState<SidebarMenu | null>(null);
  const [menuNotes, setMenuNotes] = useState<MenuNoteState>(emptyMenuNotes);

  function clearOperationalState() {
    startTransition(() => {
      setBundleSnapshot(null);
      setSourceSnapshots({});
      setActionSnapshot(null);
      setSelectedResultRowId(null);
      setMenuNotes((current) => ({ ...current, read: null, work: null, result: null }));
    });
  }

  async function refreshSettings() {
    const snapshot = await requireDesktopAppApi().loadSettings();
    startTransition(() => {
      setSettingsSnapshot(snapshot);
      setSettingsForm(toSettingsForm(snapshot));
    });
    return snapshot;
  }

  async function refreshPreflight() {
    const snapshot = await requireDesktopAppApi().runPreflight();
    startTransition(() => setPreflight(snapshot));
    return snapshot;
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [settings, nextPreflight] = await Promise.all([refreshSettings(), refreshPreflight()]);
        if (cancelled) return;
        startTransition(() => {
          setSettingsSnapshot(settings);
          setPreflight(nextPreflight);
          setMenuNotes(emptyMenuNotes());
        });
      } catch (error) {
        if (cancelled) return;
        startTransition(() => {
          setMenuNotes({
            session: normalizeError(error),
            read: null,
            work: null,
            result: null,
          });
        });
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const providerSnapshots = useMemo(
    () =>
      PROVIDER_ORDER.map((provider) => ({
        provider,
        snapshot: preflight?.providers.find((item) => item.provider === provider) ?? null,
      })),
    [preflight],
  );

  const workMenuReason = useMemo(() => {
    if (!selectedBranch) return "지점";
    if (!bundleSnapshot) return "읽기";
    if (bundleSnapshot.supportLevel !== "read-live") return "잠금";
    if (countBundleRows(bundleSnapshot) === 0) return "0건";
    return null;
  }, [bundleSnapshot, selectedBranch]);

  const resultMenuReason = useMemo(() => (actionSnapshot ? null : "준비"), [actionSnapshot]);

  const menuLocks = useMemo(
    () => ({
      session: { locked: false, reason: null },
      read: { locked: false, reason: null },
      work: { locked: workMenuReason != null, reason: workMenuReason },
      result: { locked: resultMenuReason != null, reason: resultMenuReason },
    }),
    [resultMenuReason, workMenuReason],
  );

  const sessionDisplay = useMemo<DisplayState>(
    () =>
      busyMenu === "session"
        ? { badge: "진행", text: null }
        : menuNotes.session === "오류"
          ? { badge: "오류", text: null }
          : { badge: null, text: menuNotes.session },
    [busyMenu, menuNotes.session],
  );

  const readDisplay = useMemo(
    () => getBundleDisplay(bundleSnapshot, busyMenu === "read", menuNotes.read),
    [bundleSnapshot, busyMenu, menuNotes.read],
  );

  const workDisplay = useMemo(
    () => getActionDisplay(actionSnapshot, busyMenu === "work", menuNotes.work || workMenuReason),
    [actionSnapshot, busyMenu, menuNotes.work, workMenuReason],
  );

  const resultDisplay = useMemo(() => getResultDisplay(actionSnapshot), [actionSnapshot]);

  const selectedResultRow = useMemo(
    () => actionSnapshot?.rows.find((row) => row.id === selectedResultRowId) ?? null,
    [actionSnapshot, selectedResultRowId],
  );

  function selectMenu(menu: SidebarMenu) {
    if (menu !== activeMenu && menuLocks[menu].locked) {
      return;
    }
    setActiveMenu(menu);
  }

  function updateDateField(key: keyof DateRangeState, value: string) {
    setDateRange((current) => ({ ...current, [key]: value }));
    setMenuNotes((current) => ({ ...current, read: null, work: null }));
  }

  function updateSettingsSpreadsheet(value: string) {
    setSettingsForm((current) => ({ ...current, spreadsheet: value }));
  }

  function updateSettingsTab(key: keyof AppSheetTabSettings, value: string) {
    setSettingsForm((current) => ({
      ...current,
      sheetTabs: {
        ...current.sheetTabs,
        [key]: value,
      },
    }));
  }

  function selectBranch(branch: AppBranch) {
    setSelectedBranch(branch);
    clearOperationalState();
  }

  function selectAction(action: AppReservationAction) {
    setSelectedAction(action);
    setMenuNotes((current) => ({ ...current, work: null }));
  }

  function selectResultRow(rowId: string) {
    setSelectedResultRowId(rowId);
  }

  function validateExecutionInput() {
    if (!selectedBranch) return "지점";
    if (!isValidDate(dateRange.startDate) || !isValidDate(dateRange.endDate) || dateRange.startDate > dateRange.endDate) {
      return "날짜";
    }
    return null;
  }

  async function openProvider(provider: AppProvider) {
    setBusyMenu("session");
    setMenuNotes((current) => ({ ...current, session: null }));
    try {
      await requireDesktopAppApi().openProviderBrowser(provider);
      await refreshPreflight();
    } catch (error) {
      setMenuNotes((current) => ({ ...current, session: normalizeError(error) }));
    } finally {
      setBusyMenu(null);
    }
  }

  async function recheckProvider(provider: AppProvider) {
    setBusyMenu("session");
    setMenuNotes((current) => ({ ...current, session: null }));
    try {
      if (provider === "wings-pms") {
        await requireDesktopAppApi().loginWingsSession({ username: "", password: "" });
      } else {
        await requireDesktopAppApi().reloadProviderBrowser(provider);
      }
      await refreshPreflight();
    } catch (error) {
      setMenuNotes((current) => ({ ...current, session: normalizeError(error) }));
    } finally {
      setBusyMenu(null);
    }
  }

  async function saveSettings() {
    setBusyMenu("read");
    setMenuNotes((current) => ({ ...current, read: null }));
    try {
      const baseConfig: Partial<AppSettings> = settingsSnapshot?.config ?? {};
      const snapshot = await requireDesktopAppApi().saveSettings({
        ...baseConfig,
        spreadsheet: settingsForm.spreadsheet,
        sheetName: "",
        sheetTabs: settingsForm.sheetTabs,
      });
      startTransition(() => {
        setSettingsSnapshot(snapshot);
        setSettingsForm(toSettingsForm(snapshot));
      });
      clearOperationalState();
      await refreshPreflight();
      setSettingsOpen(false);
    } catch (error) {
      setMenuNotes((current) => ({ ...current, read: normalizeError(error) }));
    } finally {
      setBusyMenu(null);
    }
  }

  async function runBundleRead() {
    const validationError = validateExecutionInput();
    if (validationError) {
      setMenuNotes((current) => ({ ...current, read: validationError }));
      return;
    }
    setBusyMenu("read");
    setMenuNotes((current) => ({ ...current, read: null }));
    try {
      const snapshot = await requireDesktopAppApi().fetchLiveReadBundle({
        branch: selectedBranch as AppBranch,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      startTransition(() => {
        setBundleSnapshot(snapshot);
        setSelectedResultRowId(null);
      });
    } catch (error) {
      setMenuNotes((current) => ({ ...current, read: normalizeError(error) }));
    } finally {
      setBusyMenu(null);
    }
  }

  async function runSourceRead(source: AppReadSource) {
    const validationError = validateExecutionInput();
    if (validationError) {
      setMenuNotes((current) => ({ ...current, read: validationError }));
      return;
    }
    setBusyMenu("read");
    setMenuNotes((current) => ({ ...current, read: null }));
    try {
      const api = requireDesktopAppApi();
      const handler =
        source === "pms" ? api.runPmsRead : source === "ota" ? api.runOtaRead : api.runSheetRead;
      const snapshot = await handler({
        branch: selectedBranch as AppBranch,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      startTransition(() => {
        setSourceSnapshots((current) => ({ ...current, [source]: snapshot }));
      });
    } catch (error) {
      setMenuNotes((current) => ({ ...current, read: normalizeError(error) }));
    } finally {
      setBusyMenu(null);
    }
  }

  async function runSelectedAction(confirmApply = false) {
    const validationError = validateExecutionInput();
    if (validationError) {
      setMenuNotes((current) => ({ ...current, work: validationError }));
      return;
    }
    const lockReason = getActionLockReason(selectedAction, selectedBranch, bundleSnapshot, actionSnapshot);
    if (lockReason && !(selectedAction === "apply" && confirmApply && isConfirmReady(actionSnapshot))) {
      setMenuNotes((current) => ({ ...current, work: lockReason }));
      return;
    }
    setBusyMenu("work");
    setMenuNotes((current) => ({ ...current, work: null }));
    try {
      const snapshot = await requireDesktopAppApi().runReservationAction({
        action: selectedAction,
        branch: selectedBranch as AppBranch,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        approvePlanToken: confirmApply ? actionSnapshot?.planToken ?? "" : "",
        executeApply: confirmApply,
      });
      startTransition(() => {
        setActionSnapshot(snapshot);
        setSelectedResultRowId(null);
      });
    } catch (error) {
      setMenuNotes((current) => ({ ...current, work: normalizeError(error) }));
    } finally {
      setBusyMenu(null);
    }
  }

  return {
    activeMenu,
    actionOptions: ACTION_OPTIONS,
    actionSnapshot,
    branchOptions: BRANCH_OPTIONS,
    bundleSnapshot,
    busyMenu,
    dateRange,
    menuLocks,
    menuNotes,
    preflight,
    providerSnapshots,
    readDisplay,
    resultDisplay,
    resultRows: actionSnapshot?.rows ?? [],
    selectedAction,
    selectedBranch,
    selectedResultRow,
    selectedResultRowId,
    sessionDisplay,
    settingsForm,
    settingsOpen,
    sourceSnapshots,
    workDisplay,
    sidebarMenus: SIDEBAR_MENUS,
    selectAction,
    selectBranch,
    selectMenu,
    selectResultRow,
    saveSettings,
    openProvider,
    recheckProvider,
    runBundleRead,
    runSelectedAction,
    runSourceRead,
    setSettingsOpen,
    updateDateField,
    updateSettingsSpreadsheet,
    updateSettingsTab,
    workMenuReason,
    resultMenuReason,
    getActionLockReason: (action: AppReservationAction) =>
      getActionLockReason(action, selectedBranch, bundleSnapshot, actionSnapshot),
    getProviderDisplay,
    getSourceDisplay,
    isConfirmReady: isConfirmReady(actionSnapshot),
  };
}
