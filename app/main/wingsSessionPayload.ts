function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCookie(cookie: unknown) {
  if (!isRecord(cookie)) return null;
  const name = normalizeText(cookie.name);
  const domain = normalizeText(cookie.domain);
  if (!name || !domain) return null;
  const secure = cookie.secure === true;
  const path = normalizeText(cookie.path) || "/";
  return {
    name,
    value: cookie.value === null || cookie.value === undefined ? "" : String(cookie.value),
    domain,
    path,
    secure,
    httpOnly: cookie.httpOnly === true,
    sameSite: normalizeText(cookie.sameSite) || "unspecified",
    session: cookie.session === true,
    url: normalizeText(cookie.url) || `${secure ? "https" : "http"}://${domain.replace(/^\./, "")}${path}`,
    expirationDate: Number.isFinite(Number(cookie.expirationDate)) ? Number(cookie.expirationDate) : undefined
  };
}

function dedupeCookies(cookies: unknown[]) {
  const seen = new Set<string>();
  const result: Array<Record<string, unknown>> = [];
  cookies.forEach((cookie) => {
    const normalized = normalizeCookie(cookie);
    if (!normalized) return;
    const key = `${normalized.domain}::${normalized.path}::${normalized.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

function buildCookieHeader(cookies: Array<Record<string, unknown>>) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function inferCsrfTokenFromCookies(cookies: Array<Record<string, unknown>>) {
  for (const cookie of cookies) {
    const name = normalizeText(cookie.name).toLowerCase();
    if (name.includes("csrf") || name.includes("xsrf")) {
      return normalizeText(cookie.value);
    }
  }
  return "";
}

function normalizeBearerToken(value: unknown) {
  return normalizeText(value).replace(/^Bearer\s+/i, "").trim();
}

export function buildWingsAppBridgePayload(params: {
  url?: string;
  title?: string;
  cookies?: unknown[];
  hints?: {
    csrfToken?: string;
    bearerToken?: string;
    role?: string;
  };
}) {
  const cookies = dedupeCookies(Array.isArray(params.cookies) ? params.cookies : []);
  const cookieHeader = buildCookieHeader(cookies);
  const csrfToken = normalizeText(params.hints?.csrfToken) || inferCsrfTokenFromCookies(cookies);
  const bearerToken = normalizeBearerToken(params.hints?.bearerToken);
  const role = normalizeText(params.hints?.role);
  const material: Record<string, unknown> = {};
  if (cookieHeader) material.cookieHeader = cookieHeader;
  if (csrfToken) material.csrfToken = csrfToken;
  if (bearerToken) material.bearerToken = bearerToken;
  if (role) material.role = role;
  const url = normalizeText(params.url) || "https://pms.sanhait.com/";
  const title = normalizeText(params.title) || "Wings PMS";
  return {
    provider: "wings-pms" as const,
    host: "pms.sanhait.com",
    url,
    title,
    rows: [],
    authSummary: {
      cookieCount: cookies.length,
      domains: Array.from(new Set(cookies.map((cookie) => normalizeText(cookie.domain)).filter(Boolean))).slice(0, 8),
      hasBearer: Boolean(bearerToken),
      hasCsrf: Boolean(csrfToken),
      hasRole: Boolean(role)
    },
    infoSummary: {
      count: 0,
      channels: [],
      dates: []
    },
    authBundle: {
      provider: "wings-pms" as const,
      capturedAt: new Date().toISOString(),
      sourceHost: "pms.sanhait.com",
      sourceUrls: [url],
      cookies,
      material
    },
    bodyTextSample: "",
    updatedAt: new Date().toISOString()
  };
}
