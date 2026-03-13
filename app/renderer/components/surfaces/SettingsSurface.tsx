import { useUiStore } from "../../state/uiStore";
import { PanelHeading, SectionCard } from "../SurfacePrimitives";

export function SettingsSurface() {
  const bridgeSummary = useUiStore((state) => state.bridgeSummary);
  const sheetRead = useUiStore((state) => state.sheetRead);
  const inventoryCompare = useUiStore((state) => state.inventoryCompare);
  const reservationAudit = useUiStore((state) => state.reservationAudit);
  const authBundleSettingsSnapshot = useUiStore((state) => state.authBundleSettingsSnapshot);
  const openWingsLogin = useUiStore((state) => state.openWingsLogin);
  const captureWingsSession = useUiStore((state) => state.captureWingsSession);
  return (
    <div className="settings-surface">
      <SectionCard>
        <PanelHeading kicker="현재 상태" title="운영 전 확인" description="시작하기 전에 꼭 확인할 상태만 보여줍니다." />
        <div className="simple-status-grid">
          <article className="simple-status-card">
            <span>브라우저 연결</span>
            <strong>
              {bridgeSummary.authSummary?.cookieCount || bridgeSummary.authSummary?.hasBearer || bridgeSummary.authSummary?.hasCsrf
                ? "연결됨"
                : "준비 필요"}
            </strong>
          </article>
          <article className="simple-status-card">
            <span>시트</span>
            <strong>{sheetRead.supportLevel === "read-live" ? "불러옴" : sheetRead.supportLevel === "partial-live" ? "확인 중" : "미연결"}</strong>
          </article>
          <article className="simple-status-card">
            <span>조회 상태</span>
            <strong>
              {inventoryCompare.supportLevel === "read-live" || reservationAudit.supportLevel === "read-live"
                ? "실제 정보 포함"
                : inventoryCompare.supportLevel === "partial-live" || reservationAudit.supportLevel === "partial-live"
                  ? "연결 확인 중"
                  : "미연결"}
            </strong>
          </article>
        </div>
      </SectionCard>

      <SectionCard>
        <PanelHeading kicker="브라우저 확장" title="확장 프로그램 역할" description="브라우저의 로그인 상태와 현재 페이지 정보를 앱으로 가져옵니다." />
        <div className="process-grid process-grid-compact">
          <article className="process-card tone-default">
            <span>가져온 항목</span>
            <strong>{bridgeSummary.infoSummary?.count ?? 0}건</strong>
            <p>채널 {(bridgeSummary.infoSummary?.channels || []).join(", ") || "없음"}</p>
          </article>
          <article className="process-card tone-default">
            <span>최근 연결</span>
            <strong>{authBundleSettingsSnapshot ? authBundleSettingsSnapshot.provider : "없음"}</strong>
            <p>{authBundleSettingsSnapshot?.host || "저장된 연결 정보 없음"}</p>
          </article>
        </div>
        <div className="settings-actions">
          <button type="button" className="action-button" onClick={() => void openWingsLogin()}>
            윙스 로그인 열기
          </button>
          <button type="button" className="action-button" onClick={() => void captureWingsSession()}>
            현재 세션 읽기
          </button>
        </div>
      </SectionCard>

    </div>
  );
}
