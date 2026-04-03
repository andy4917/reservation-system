import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppBranch, AppBranchAvailability, AppBranchOption, AppProvider } from "../../src/desktop/app-v2-contracts.js";
import { APP_BRANCH_OPTIONS, getAppBranchOption } from "../../src/desktop/app-v2-contracts.js";

interface MappingBranchRecord {
  branch?: string;
  display_name?: string;
  sheet_tabs?: string[];
  sheet_scope?: { spreadsheet_id?: string; sheet_name?: string };
  ota_profiles?: Record<string, { business_id?: string; branch_id?: string; status?: string }>;
  wings_profiles?: Array<{
    property_no?: string;
    bsns_code?: string;
    preset_key?: string;
    endpoint_path?: string;
    status?: string;
  }>;
}

export interface BranchProviderBinding {
  provider: AppProvider;
  mode: "session-auth" | "config-auth";
  active: boolean;
  metadata: Record<string, string>;
}

export interface BranchRuntimeProfile {
  branch: AppBranch;
  canonicalBranch: string;
  label: string;
  availability: AppBranchAvailability;
  reason: string;
  gate: {
    readAllowed: boolean;
    actionAllowed: boolean;
  };
  sheetTabs: string[];
  providerBindings: BranchProviderBinding[];
}

function loadBranchProviderMapping(): MappingBranchRecord[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const mappingPath = path.resolve(here, "..", "..", "truth_dataset", "branch_provider_mapping_v1.json");
  const parsed = JSON.parse(fs.readFileSync(mappingPath, "utf8")) as { branches?: MappingBranchRecord[] };
  return Array.isArray(parsed.branches) ? parsed.branches : [];
}

const mappingRecords = loadBranchProviderMapping();

const appToCanonicalBranch: Record<AppBranch, string> = {
  COEX: "COEX",
  GANGNAM: "GANGNAM",
  SEOLLEUNG: "BRANCH_THE_SEOLLEUNG",
  SAMSUNG: "BRANCH_THE_SAMSEONG",
};

function findMappingBranch(branch: AppBranch) {
  const canonicalBranch = appToCanonicalBranch[branch];
  return mappingRecords.find((item) => String(item.branch || "").trim() === canonicalBranch) ?? null;
}

function buildProviderBindings(branch: AppBranch, mapping: MappingBranchRecord | null, branchOption: AppBranchOption): BranchProviderBinding[] {
  const availability = branchOption.availability;
  const otaProfiles = mapping?.ota_profiles ?? {};
  const wingsProfiles = Array.isArray(mapping?.wings_profiles) ? mapping?.wings_profiles : [];
  const firstWings = wingsProfiles[0] ?? {};
  return [
    {
      provider: "wings-pms",
      mode: "session-auth",
      active: availability === "active",
      metadata: {
        propertyNo: String(firstWings.property_no || ""),
        bsnsCode: String(firstWings.bsns_code || ""),
        presetKey: String(firstWings.preset_key || "wings-reservation-list"),
        endpointPath: String(firstWings.endpoint_path || "/pms/biz/ir04_0200X_V03/searchListRsvn.do"),
      },
    },
    {
      provider: "naver-partner",
      mode: "session-auth",
      active: availability === "active",
      metadata: {
        businessId: String(otaProfiles["naver-partner"]?.business_id || ""),
      },
    },
    {
      provider: "admin-station",
      mode: "session-auth",
      active: availability === "active",
      metadata: {
        branchId: String(otaProfiles["admin-station"]?.branch_id || ""),
      },
    },
  ];
}

export function getBranchRuntimeProfile(branch: AppBranch): BranchRuntimeProfile {
  const branchOption = getAppBranchOption(branch);
  const mapping = findMappingBranch(branch);
  const sheetTabs = Array.isArray(mapping?.sheet_tabs) ? mapping?.sheet_tabs.filter(Boolean) : [];
  return {
    branch,
    canonicalBranch: appToCanonicalBranch[branch],
    label: mapping?.display_name || branchOption.label,
    availability: branchOption.availability,
    reason: branchOption.reason,
    gate: {
      readAllowed: branchOption.availability === "active",
      actionAllowed: branchOption.availability === "active",
    },
    sheetTabs,
    providerBindings: buildProviderBindings(branch, mapping, branchOption),
  };
}

export function getAllBranchRuntimeProfiles(): BranchRuntimeProfile[] {
  return APP_BRANCH_OPTIONS.map((item) => getBranchRuntimeProfile(item.branch));
}

export function getProviderBinding(branch: AppBranch, provider: AppProvider): BranchProviderBinding {
  const profile = getBranchRuntimeProfile(branch);
  return profile.providerBindings.find((item) => item.provider === provider) ?? {
    provider,
    mode: "session-auth",
    active: false,
    metadata: {},
  };
}
