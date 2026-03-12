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
      label: "Naver Partner",
      capabilities: ["inventory-read", "session-auth", "csrf-role", "dom-fallback"],
      owner: "hybrid",
      status: "bridge-required"
    },
    {
      provider: "admin-station",
      label: "Admin Station",
      capabilities: ["inventory-read", "reservation-read", "bearer-auth"],
      owner: "hybrid",
      status: "bridge-required"
    },
    {
      provider: "wings-pms",
      label: "Wings PMS",
      capabilities: [
        "reservation-lookup",
        "reservation-detail",
        "source-catalog",
        "nationality-lookup",
        "assigned-room-lookup",
        "har-readonly"
      ],
      owner: "hybrid",
      status: "ready"
    }
  ];
}
