import type { AppTaskId } from "../types";

export const TASK_META: Record<AppTaskId, { title: string; summary: string; action: string }> = {
  "inventory-compare": {
    title: "Inventory Compare",
    summary: "사이트 재고, 시트 스냅샷, mismatch preview를 앱 메인 화면에서 직접 비교합니다.",
    action: "현재 단계: app-owned compare surface restored"
  },
  "reservation-audit": {
    title: "Reservation Audit",
    summary: "PMS 예약 fetch, anomaly, evidence summary를 앱 우측 패널과 함께 검토합니다.",
    action: "현재 단계: reservation audit surface restored"
  },
  "apply-review": {
    title: "Apply Review",
    summary: "승인 게이트, apply preview, post-apply summary를 앱 기준으로 재구성합니다.",
    action: "다음 단계: live apply는 bridge policy 이후 연결"
  },
  settings: {
    title: "Settings",
    summary: "시트, PMS, provider, auth bundle, bridge 연결 상태를 앱 저장소 기준으로 정리합니다.",
    action: "다음 단계: secure storage wrapper 추가"
  },
  "dry-run": {
    title: "Dry Run",
    summary: "fixture를 사용해 브라우저 없이 흐름 전체를 재생합니다.",
    action: "다음 단계: replay fixture와 scenario selector 추가"
  }
};
