import type { ProviderType } from "../contracts";

export interface ProviderCapabilityCard {
  provider: ProviderType;
  label: string;
  capabilities: string[];
  owner: "app" | "extension" | "hybrid";
  status: "ready" | "bridge-required" | "hold";
}

export function getProviderCapabilityCards(): ProviderCapabilityCard[] {
  return [
    {
      provider: "naver-partner",
      label: "네이버 예약",
      capabilities: ["재고 조회", "로그인 확인", "페이지 읽기"],
      owner: "hybrid",
      status: "bridge-required"
    },
    {
      provider: "admin-station",
      label: "스테이션 관리자",
      capabilities: ["재고 조회", "예약 조회", "로그인 확인"],
      owner: "hybrid",
      status: "bridge-required"
    },
    {
      provider: "wings-pms",
      label: "윙스 PMS",
      capabilities: ["예약 조회", "상세 확인", "읽기 전용 연결"],
      owner: "hybrid",
      status: "ready"
    }
  ];
}
