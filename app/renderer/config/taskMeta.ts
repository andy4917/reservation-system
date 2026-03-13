import type { AppTaskId } from "../types";

export const TASK_META: Record<AppTaskId, { title: string; summary: string; action: string }> = {
  "inventory-compare": {
    title: "재고 비교",
    summary: "사이트 재고와 시트 값을 같은 기간으로 비교합니다.",
    action: "조회 후 표에서 차이만 확인하세요."
  },
  "reservation-audit": {
    title: "예약 점검",
    summary: "PMS 예약과 운영 정보를 대조해 이상 여부를 확인합니다.",
    action: "이상 항목만 우선 검토하세요."
  },
  "apply-review": {
    title: "적용 전 확인",
    summary: "실제 반영 전 차이와 주의 항목을 확인합니다.",
    action: "현재는 확인 화면만 준비된 상태입니다."
  },
  settings: {
    title: "설정",
    summary: "확장 연결, 시트 연결, 추천 기능 상태를 확인합니다.",
    action: "필요한 연결 상태만 간단히 점검하세요."
  },
  "dry-run": {
    title: "테스트 모드",
    summary: "실제 사이트 연결 없이 예시 데이터로 화면을 확인합니다.",
    action: "실제 운영 전 화면 흐름을 점검하세요."
  }
};
