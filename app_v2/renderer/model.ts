import type {
  AppBranch,
  AppLiveReadBundleSnapshot,
  AppLiveReadSnapshot,
  AppProvider,
  AppProviderOperatingSnapshot,
  AppReservationAction,
  AppReservationActionSnapshot,
  AppReservationEngineStatus,
  AppSheetTabSettings,
} from "../../src/desktop/app-v2-contracts.js";
import { APP_SOURCE_ACCESS_MODE } from "../../src/desktop/app-v2-contracts.js";

export const SIDEBAR_MENUS = [
  { id: "session", label: "세션" },
  { id: "read", label: "읽기" },
  { id: "work", label: "작업" },
  { id: "result", label: "결과" },
] as const;

export const PROVIDER_ORDER: AppProvider[] = ["wings-pms", "naver-partner", "admin-station"];

export const BRANCH_OPTIONS = [
  { value: "GANGNAM", label: "강남" },
  { value: "COEX", label: "코엑스" },
  { value: "SEOLLEUNG", label: "선릉" },
  { value: "SAMSEONG", label: "삼성" },
] as const satisfies ReadonlyArray<{ value: AppBranch; label: string }>;

export const ACTION_OPTIONS: AppReservationAction[] = [
  "compare",
  "validate",
  "reconcile",
  "edit",
  "apply",
  "order-list",
  "arrival",
];

export const EMPTY_SHEET_TABS: AppSheetTabSettings = {
  gangnam: "",
  coex: "",
  seolleung: "",
  samseong: "",
};

export type SidebarMenu = (typeof SIDEBAR_MENUS)[number]["id"];
export type StatusBadge = "준비" | "진행" | "완료" | "오류";

export interface DisplayState {
  badge: StatusBadge | null;
  text: string | null;
}

export interface MenuLockState {
  locked: boolean;
  reason: string | null;
}

export function getBranchLabel(branch: AppBranch | null | undefined) {
  return BRANCH_OPTIONS.find((option) => option.value === branch)?.label ?? "";
}

export function getProviderLabel(provider: AppProvider) {
  if (provider === "wings-pms") return "WINGS";
  if (provider === "naver-partner") return "NAVER";
  return "STATION";
}

export function getProviderDisplay(snapshot?: AppProviderOperatingSnapshot | null): DisplayState {
  if (!snapshot) {
    return { badge: null, text: "미확인" };
  }
  if (snapshot.pageState === "loading") {
    return { badge: "진행", text: null };
  }
  if (snapshot.operatingStatus === "ready") {
    return { badge: "준비", text: null };
  }
  if (snapshot.operatingStatus === "error" || snapshot.pageState === "error") {
    return { badge: "오류", text: null };
  }
  if (snapshot.operatingStatus === "needs-login") {
    return { badge: null, text: "로그인" };
  }
  return { badge: null, text: "잠금" };
}

export function countBundleRows(bundle: AppLiveReadBundleSnapshot | null) {
  return bundle?.sources.reduce((sum, source) => sum + source.recordsImported, 0) ?? 0;
}

export function countActionRows(snapshot: AppReservationActionSnapshot | null) {
  if (!snapshot) return 0;
  return typeof snapshot.issueCount === "number" ? snapshot.issueCount : snapshot.rows.length;
}

export function getBundleDisplay(
  bundle: AppLiveReadBundleSnapshot | null,
  busy: boolean,
  fallbackText: string | null,
): DisplayState {
  if (busy) {
    return { badge: "진행", text: null };
  }
  if (!bundle) {
    if (fallbackText === "오류") {
      return { badge: "오류", text: null };
    }
    return fallbackText ? { badge: null, text: fallbackText } : { badge: null, text: null };
  }
  const totalRows = countBundleRows(bundle);
  if (bundle.supportLevel === "read-live") {
    return {
      badge: "완료",
      text: totalRows > 0 ? `${totalRows}건` : "0건",
    };
  }
  if (totalRows === 0 && bundle.supportLevel !== "blocked") {
    return { badge: "완료", text: "0건" };
  }
  return { badge: null, text: "잠금" };
}

export function getSourceDisplay(snapshot: AppLiveReadSnapshot | null | undefined): DisplayState {
  if (!snapshot) {
    return { badge: null, text: null };
  }
  if (snapshot.status === "error") {
    return { badge: "오류", text: null };
  }
  if (snapshot.status === "done") {
    return { badge: "완료", text: snapshot.recordsImported > 0 ? `${snapshot.recordsImported}건` : "0건" };
  }
  if (snapshot.status === "loading") {
    return { badge: "진행", text: null };
  }
  return { badge: null, text: null };
}

export function getActionDisplay(
  snapshot: AppReservationActionSnapshot | null,
  busy: boolean,
  fallbackText: string | null,
): DisplayState {
  if (busy) {
    return { badge: "진행", text: null };
  }
  if (!snapshot) {
    if (fallbackText === "오류") {
      return { badge: "오류", text: null };
    }
    return fallbackText ? { badge: null, text: fallbackText } : { badge: null, text: null };
  }
  if (snapshot.status === "error") {
    return { badge: "오류", text: null };
  }
  return { badge: "완료", text: `${countActionRows(snapshot)}건` };
}

export function getResultDisplay(snapshot: AppReservationActionSnapshot | null): DisplayState {
  if (!snapshot) {
    return { badge: "준비", text: null };
  }
  if (snapshot.status === "error") {
    return { badge: "오류", text: null };
  }
  return { badge: "완료", text: `${countActionRows(snapshot)}건` };
}

export function getActionLockReason(
  action: AppReservationAction,
  branch: AppBranch | null,
  bundle: AppLiveReadBundleSnapshot | null,
  actionSnapshot: AppReservationActionSnapshot | null,
) {
  if (action === "apply" && APP_SOURCE_ACCESS_MODE === "read-only") return "읽기전용";
  if (!branch) return "지점";
  if (!bundle) return "읽기";
  if (bundle.supportLevel !== "read-live") return "잠금";
  if (countBundleRows(bundle) === 0) return "0건";
  if (action === "apply") {
    if (!actionSnapshot) return "승인";
    if (!actionSnapshot.requiresApproval) return "승인";
    if (!actionSnapshot.applyAllowed) return "잠금";
    if (!actionSnapshot.planToken) return "토큰";
  }
  return null;
}

export function isConfirmReady(snapshot: AppReservationActionSnapshot | null) {
  return Boolean(snapshot?.requiresApproval && snapshot.applyAllowed && snapshot.planToken);
}

export function getEngineStateLabel(engineStatus?: AppReservationEngineStatus) {
  if (engineStatus === "applied") return "완료";
  if (engineStatus === "planned") return "완료";
  if (engineStatus === "pending-source") return "잠금";
  if (engineStatus === "fallback") return "오류";
  return null;
}
