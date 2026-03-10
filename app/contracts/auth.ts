export type ProviderType = "naver-partner" | "admin-station" | "wings-pms";

export interface AuthMaterial {
  cookieHeader?: string;
  csrfToken?: string;
  bearerToken?: string;
  role?: string;
}

export interface AuthBundle {
  provider: ProviderType;
  capturedAt: string;
  material: AuthMaterial;
  sourceHost?: string;
}

export interface AuthCaptureRequest {
  type: "auth.capture";
  provider: ProviderType;
  tabContext?: {
    host?: string;
    url?: string;
  };
}

export interface AuthCaptureResponse {
  ok: true;
  sessionAvailable: boolean;
  authBundle: AuthBundle | null;
}

export interface AuthRestoreRequest {
  type: "auth.restore";
  provider: ProviderType;
  authBundle: AuthBundle;
}

export interface AuthRestoreResponse {
  ok: true;
  restored: boolean;
}
