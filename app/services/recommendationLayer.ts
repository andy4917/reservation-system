import type { RecommendationScoreRequest, RecommendationSettings } from "../contracts/recommendation.js";
import { scoreRecommendationCandidates } from "./bridgeClient.js";
import type { BridgeSummary, RecommendationAssist, RecommendationGroup, RecommendationResult, WorkspaceMockState } from "../renderer/types.js";

type RecommendationFieldType = RecommendationResult["input"]["fieldType"];

interface ProviderProfile {
  label: string;
  channelAliases: string[];
  fallbackSignals: string[];
}

interface ClassificationRule {
  id: RecommendationGroup["id"];
  title: string;
  detail: string;
  confidence: number;
  test: (params: {
    rowText: string;
    bridgeSummary: BridgeSummary;
    state: WorkspaceMockState;
  }) => boolean;
}

const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
  "naver-partner": {
    label: "Naver Partner",
    channelAliases: ["naver", "naver partner", "네이버", "partner.booking.naver.com"],
    fallbackSignals: ["closed", "마감", "fallback", "pending"]
  },
  "admin-station": {
    label: "Admin Station",
    channelAliases: ["station", "admin station", "스테이션", "admin.staystation"],
    fallbackSignals: ["closed", "fallback", "pending", "sold out"]
  },
  "wings-pms": {
    label: "Wings PMS",
    channelAliases: ["wings", "wings pms", "pms"],
    fallbackSignals: ["pending", "hold", "review"]
  }
};

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    id: "dom-drift",
    title: "DOM / Selector Drift",
    detail: "fallback, closed text, DOM snapshot 의존 흔적이 있어 selector drift 후보로 분류했습니다.",
    confidence: 0.76,
    test: ({ rowText }) => /fallback|dom|closed text|snapshot|selector/i.test(rowText)
  },
  {
    id: "mapping-drift",
    title: "Normalization / Alias Drift",
    detail: "room/channel/raw-derived 불일치 표현이 있어 alias 또는 정규화 drift 후보로 분류했습니다.",
    confidence: 0.72,
    test: ({ rowText }) => /raw row|derived row|disagree|alias|normalize|mapping|unknown/i.test(rowText)
  },
  {
    id: "range-gap",
    title: "Range / Scope Gap",
    detail: "선택 범위와 실제 row window 사이에 차이가 있을 수 있어 범위 재검토 후보로 분류했습니다.",
    confidence: 0.64,
    test: ({ rowText }) => /range|selected|empty|no rows|date window|pending payload/i.test(rowText)
  },
  {
    id: "auth-context",
    title: "Auth / Session Context",
    detail: "live bridge 문맥 또는 인증 힌트가 약해 재로그인/세션 재확인 후보로 분류했습니다.",
    confidence: 0.68,
    test: ({ rowText, bridgeSummary, state }) =>
      /bridge missing|context unavailable|auth|csrf|bearer|session/i.test(rowText) ||
      (!state.bridgeStatus.sessionAvailable && !bridgeSummary.authSummary?.cookieCount)
  }
];

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function toTokenKey(value: unknown) {
  return normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tokenize(value: unknown) {
  return toTokenKey(value)
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeBranchKey(value: unknown) {
  return normalizeText(value).replace(/\s+/g, "_");
}

function looksLikePlaceholderRoomLabel(value: unknown) {
  const text = normalizeText(value);
  return !text || /unknown|객실명 미정|bridge pending|no rows|pending/.test(text);
}

function detectRoomFamily(value: unknown) {
  const text = normalizeText(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/더\s*(강남|코엑스|선릉)|삼성점|the\s+(gangnam|coex|seolleung|samsung)/gi, " ")
    .replace(/객실명\s*미정|spa|suite|room|city/g, " ")
    .replace(/\s+/g, " ");
  if (!text.trim()) return "";
  if (/grand|8\s*인/.test(text)) return "grand";
  if (/double|twin|4\s*인/.test(text)) return "double";
  if (/urban|6\s*인/.test(text)) return "urban";
  return "";
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function scoreCandidate(rawValue: string, candidate: string) {
  const rawKey = toTokenKey(rawValue);
  const candidateKey = toTokenKey(candidate);
  if (!rawKey || !candidateKey) return 0;
  if (rawKey === candidateKey) return 1;
  if (candidateKey.includes(rawKey) || rawKey.includes(candidateKey)) return 0.82;

  const rawTokens = tokenize(rawValue);
  const candidateTokens = tokenize(candidate);
  if (rawTokens.length === 0 || candidateTokens.length === 0) return 0;
  const overlap = rawTokens.filter((token) => candidateTokens.includes(token)).length;
  return overlap / Math.max(rawTokens.length, candidateTokens.length);
}

function uniqueCandidates(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = toTokenKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildObservedRoomCatalog(state: WorkspaceMockState) {
  return uniqueCandidates(state.inventoryCompare.rows.map((row) => row.roomType)).filter(
    (value) => !looksLikePlaceholderRoomLabel(value)
  );
}

function buildChannelCatalog(provider: string) {
  const profile = PROVIDER_PROFILES[provider] || PROVIDER_PROFILES["naver-partner"];
  return uniqueCandidates([profile.label, ...profile.channelAliases, "NAVER", "STATION"]);
}

interface CandidateSeed {
  value: string;
  score?: number;
  reason?: string;
}

function createRecommendation(params: {
  rawValue: string;
  source: string;
  provider: string;
  fieldType: RecommendationFieldType;
  evidence: string[];
  confidence: number;
  candidates: CandidateSeed[];
  reason: string;
}): RecommendationResult | null {
  const unique: CandidateSeed[] = [];
  const seen = new Set<string>();
  params.candidates.forEach((candidate) => {
    const value = typeof candidate === "string" ? candidate : candidate.value;
    const key = toTokenKey(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(candidate);
  });
  const topCandidates = unique.slice(0, 3);
  if (topCandidates.length === 0) return null;
  return {
    input: {
      rawValue: params.rawValue,
      source: params.source,
      provider: params.provider,
      fieldType: params.fieldType,
      evidence: params.evidence,
      confidence: clampConfidence(params.confidence)
    },
    candidates: topCandidates.map((candidate) => {
      const value = typeof candidate === "string" ? candidate : candidate.value;
      const baseScore = typeof candidate === "string" ? 0 : candidate.score ?? 0;
      const score = clampConfidence(Math.max(params.confidence, baseScore, scoreCandidate(params.rawValue, value)));
      return {
        value,
        score,
        confidence: score,
        reason:
          typeof candidate !== "string" && candidate.reason
            ? candidate.reason
            : params.fieldType === "range"
              ? "row/log window에서 추정한 범위 후보"
              : params.fieldType === "channel"
                ? "provider alias/profile 기반 채널 후보"
                : "현재 compare row와 관측된 alias 후보를 기반으로 제안"
      };
    }),
    reason: params.reason,
    confidence: clampConfidence(params.confidence),
    requires_review: true
  };
}

function buildRoomAliasCandidates(
  observedRooms: string[],
  params: { branch?: string; roomType: string; siteRaw: string; sheetRaw: string }
) {
  const branchKey = normalizeBranchKey(params.branch);
  const sourceText = [params.roomType, params.siteRaw, params.sheetRaw].join(" ");
  const family = detectRoomFamily(sourceText);
  const candidates = observedRooms
    .map((room) => {
      const roomFamily = detectRoomFamily(room);
      let score = scoreCandidate(sourceText, room);
      let reason = "현재 compare row와 관측된 alias 후보를 기반으로 제안";
      if (family && roomFamily && family === roomFamily) {
        score = Math.max(score, 0.86);
        reason = "room alias family와 인원 표기를 기준으로 보정한 후보";
      }
      if (branchKey === "branch_the_seolleung" && /객실명 미정/.test(sourceText) && roomFamily) {
        if (family === "grand") {
          score = Math.max(score, roomFamily === "grand" ? 0.84 : 0.62);
        } else {
          score = Math.max(score, roomFamily === "urban" || roomFamily === "double" ? 0.78 : 0.48);
        }
        reason = "선릉 브랜치의 placeholder room label이라 branch-aware review 후보를 함께 유지";
      }
      return { value: room, score, reason };
    })
    .filter((entry) => entry.score >= 0.45)
    .sort((left, right) => right.score - left.score);
  return candidates;
}

function buildRoomTypeRecommendations(state: WorkspaceMockState, provider: string) {
  const observedRooms = buildObservedRoomCatalog(state);
  const recommendations: RecommendationResult[] = [];

  state.inventoryCompare.rows
    .filter((row) => row.status !== "match")
    .forEach((row) => {
      const candidates = buildRoomAliasCandidates(observedRooms.filter((room) => room !== row.roomType), {
        branch: row.branch,
        roomType: row.roomType,
        siteRaw: row.siteRaw,
        sheetRaw: row.sheetRaw
      });
      const hasUnknownTrace = /unknown|fallback|derived|raw/i.test(`${row.reason} ${row.action}`);
      if (!hasUnknownTrace && candidates.length === 0) return;
      const recommendation = createRecommendation({
        rawValue: row.roomType,
        source: row.id,
        provider,
        fieldType: "roomType",
        evidence: [row.reason, row.action, `${row.siteRaw} vs ${row.sheetRaw}`, row.branch || ""].filter(Boolean),
        confidence: hasUnknownTrace ? 0.66 : 0.54,
        candidates:
          candidates.length > 0
            ? candidates
            : observedRooms.filter((room) => room !== row.roomType).map((value) => ({ value, score: 0.46 })),
        reason: "현재 row의 roomType가 mismatch/warning 이유와 함께 관측되어 alias 후보만 제시합니다. 최종 확정은 검증 단계가 유지합니다."
      });
      if (recommendation) recommendations.push(recommendation);
    });

  return recommendations.slice(0, 4);
}

function buildChannelRecommendations(state: WorkspaceMockState, provider: string) {
  const catalog = buildChannelCatalog(provider);
  return state.inventoryCompare.rows
    .filter((row) => row.status !== "match")
    .map((row) => {
      const candidates = catalog
        .filter((candidate) => candidate !== row.channel)
        .map((candidate) => ({ candidate, score: scoreCandidate(row.channel, candidate) }))
        .filter((entry) => entry.score >= 0.35)
        .sort((left, right) => right.score - left.score)
        .map((entry) => entry.candidate);
      return createRecommendation({
        rawValue: row.channel,
        source: row.id,
        provider,
        fieldType: "channel",
        evidence: [row.reason, row.action],
        confidence: 0.51,
        candidates: candidates.map((value) => ({ value })),
        reason: "provider profile과 channel alias table 기준으로 채널 표기를 정규화 후보만 제시합니다."
      });
    })
    .filter((item): item is RecommendationResult => Boolean(item))
    .slice(0, 2);
}

function extractDates(lines: string[]) {
  return uniqueCandidates(
    lines.flatMap((line) => {
      const matches = line.match(/\b\d{4}-\d{2}-\d{2}\b/g);
      return matches ? matches : [];
    })
  ).sort();
}

function buildRangeRecommendation(state: WorkspaceMockState, provider: string) {
  const rowDates = uniqueCandidates(state.inventoryCompare.rows.map((row) => row.date).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))).sort();
  const lineDates = extractDates([...state.evidenceLines, ...state.validationLines, ...state.logs]);
  const observedDates = uniqueCandidates([...rowDates, ...lineDates]).sort();
  if (observedDates.length === 0) return null;

  const candidateRange = `${observedDates[0]}..${observedDates[observedDates.length - 1]}`;
  const selectedRange = `${state.selectedRange.startDate}..${state.selectedRange.endDate}`;
  if (candidateRange === selectedRange) return null;

  return createRecommendation({
    rawValue: selectedRange,
    source: "selected-range",
    provider,
    fieldType: "range",
    evidence: [
      `observed row dates: ${rowDates.join(", ") || "none"}`,
      `observed line dates: ${lineDates.join(", ") || "none"}`
    ],
    confidence: 0.63,
    candidates: [{ value: candidateRange, score: 0.63 }],
    reason: "선택 범위와 row/log에서 보이는 날짜 창이 달라 범위 후보만 제안합니다. 자동 적용은 하지 않습니다."
  });
}

function buildValueRecommendations(state: WorkspaceMockState, provider: string) {
  const profile = PROVIDER_PROFILES[provider] || PROVIDER_PROFILES["naver-partner"];
  const recommendations: RecommendationResult[] = [];
  state.inventoryCompare.rows
    .filter((row) => row.status !== "match")
    .forEach((row) => {
      const rawValues = [row.siteRaw, row.sheetRaw].filter(Boolean);
      rawValues.forEach((value) => {
        const normalized = normalizeText(value);
        const hasFallbackSignal = profile.fallbackSignals.some((signal) => normalized.includes(signal));
        if (!hasFallbackSignal) return;
        const recommendation = createRecommendation({
          rawValue: value,
          source: row.id,
          provider,
          fieldType: "inventoryValue",
          evidence: [row.reason, row.action, `${row.siteRaw} vs ${row.sheetRaw}`],
          confidence: 0.58,
          candidates: [{ value: "0/0" }, { value: "0/1" }, { value: "manual review" }],
          reason: "fallback 또는 closed 텍스트 흔적이 있어 inventory value를 해석 후보로만 제시합니다."
        });
        if (recommendation) recommendations.push(recommendation);
      });
    });
  return recommendations.slice(0, 2);
}

function classifyMismatchGroups(state: WorkspaceMockState) {
  const groups = new Map<string, RecommendationGroup>();
  const provider = state.bridgeStatus.provider || "naver-partner";
  const bridgeSummary = state.bridgeSummary;

  state.inventoryCompare.rows
    .filter((row) => row.status !== "match")
    .forEach((row) => {
      const rowText = [row.reason, row.action, row.siteRaw, row.sheetRaw, row.diff, row.channel].join(" ");
      let matched = false;
      CLASSIFICATION_RULES.forEach((rule) => {
        if (!rule.test({ rowText, bridgeSummary, state })) return;
        matched = true;
        const existing = groups.get(rule.id);
        if (existing) {
          existing.count += 1;
          if (existing.examples.length < 3) existing.examples.push(`${row.date} ${row.roomType} ${row.channel}`);
        } else {
          groups.set(rule.id, {
            id: rule.id,
            title: rule.title,
            detail: `${rule.detail} provider=${provider}`,
            count: 1,
            confidence: rule.confidence,
            examples: [`${row.date} ${row.roomType} ${row.channel}`]
          });
        }
      });
      if (!matched && row.status === "mismatch") {
        const existing = groups.get("inventory-delta");
        if (existing) {
          existing.count += 1;
          if (existing.examples.length < 3) existing.examples.push(`${row.date} ${row.roomType} ${row.channel}`);
        } else {
          groups.set("inventory-delta", {
            id: "inventory-delta",
            title: "Inventory Delta",
            detail: "구조적 drift 흔적보다 실제 재고 차이 가능성이 더 커 보여 기본 delta 군으로 남겼습니다.",
            count: 1,
            confidence: 0.57,
            examples: [`${row.date} ${row.roomType} ${row.channel}`]
          });
        }
      }
    });

  return Array.from(groups.values()).sort((left, right) => right.count - left.count || right.confidence - left.confidence);
}

function buildSummary(state: WorkspaceMockState, groups: RecommendationGroup[], recommendations: RecommendationResult[]) {
  const mismatchCount = state.inventoryCompare.mismatchCount;
  const warningCount = state.inventoryCompare.warningCount;
  const topGroups = groups.slice(0, 2).map((group) => `${group.title} ${group.count}건`);
  const summaryParts = [
    `${mismatchCount} mismatch / ${warningCount} warning rows를 유지한 채`,
    `${recommendations.length}개의 review-only recommendation을 생성했습니다.`
  ];
  if (topGroups.length > 0) {
    summaryParts.push(`주요 원인군은 ${topGroups.join(", ")} 입니다.`);
  }
  return summaryParts.join(" ");
}

async function rerankRecommendations(
  recommendations: RecommendationResult[],
  settings?: RecommendationSettings
) {
  if (recommendations.length === 0) return recommendations;

  const request: RecommendationScoreRequest = {
    settings,
    items: recommendations.map((item) => ({
      source: item.input.source,
      rawValue: item.input.rawValue,
      provider: item.input.provider,
      fieldType: item.input.fieldType,
      candidates: item.candidates.map((candidate) => candidate.value)
    }))
  };
  const response = await scoreRecommendationCandidates(request).catch(() => null);
  if (!response) return recommendations;

  const scoreMap = new Map<string, Map<string, { score: number; reason: string }>>();
  response.results.forEach((result) => {
    const itemMap = new Map<string, { score: number; reason: string }>();
    result.candidates.forEach((candidate) => {
      itemMap.set(candidate.value, { score: candidate.score, reason: candidate.reason });
    });
    scoreMap.set(`${result.source}:${result.fieldType}`, itemMap);
  });

  return recommendations.map((item) => {
    const itemScores = scoreMap.get(`${item.input.source}:${item.input.fieldType}`);
    const threshold = settings?.scoreThreshold ?? 0.58;
    const candidates = item.candidates
      .map((candidate) => {
        const scored = itemScores?.get(candidate.value);
        if (!scored) return candidate;
        const preservedScore = Math.max(candidate.score, scored.score);
        return {
          ...candidate,
          score: preservedScore,
          confidence: clampConfidence(Math.max(candidate.confidence, preservedScore)),
          reason: preservedScore > scored.score ? candidate.reason : scored.reason
        };
      })
      .filter((candidate) => candidate.score >= threshold)
      .sort((left, right) => right.score - left.score);

    return {
      ...item,
      candidates
    };
  }).filter((item) => item.candidates.length > 0);
}

export async function buildRecommendationAssist(
  state: WorkspaceMockState,
  options?: { enabled?: boolean; settings?: RecommendationSettings }
): Promise<RecommendationAssist> {
  if (options?.enabled === false) {
    return {
      enabled: false,
      summary: "Recommendation assist is disabled.",
      recommendations: [],
      mismatchGroups: []
    };
  }

  const provider = state.bridgeStatus.provider || "naver-partner";
  const recommendations = [
    ...buildRoomTypeRecommendations(state, provider),
    ...buildChannelRecommendations(state, provider),
    ...buildValueRecommendations(state, provider)
  ];
  const rangeRecommendation = buildRangeRecommendation(state, provider);
  if (rangeRecommendation) recommendations.push(rangeRecommendation);
  const rerankedRecommendations = await rerankRecommendations(recommendations.slice(0, 8), options?.settings);

  const mismatchGroups = classifyMismatchGroups(state);
  return {
    enabled: true,
    summary: buildSummary(state, mismatchGroups, rerankedRecommendations),
    recommendations: rerankedRecommendations,
    mismatchGroups
  };
}
