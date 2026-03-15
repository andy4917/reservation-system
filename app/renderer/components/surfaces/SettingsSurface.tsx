import { useUiStore } from "../../state/uiStore";
import { PanelHeading, SectionCard } from "../SurfacePrimitives";

function toInputValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? String(value) : "";
}

export function SettingsSurface() {
  const bridgeSummary = useUiStore((state) => state.bridgeSummary);
  const sheetRead = useUiStore((state) => state.sheetRead);
  const manualScanAnchor = useUiStore((state) => state.manualScanAnchor);
  const manualScanAnchorDraft = useUiStore((state) => state.manualScanAnchorDraft);
  const termBindings = useUiStore((state) => state.termBindings);
  const unresolvedBindings = useUiStore((state) => state.unresolvedBindings);
  const inventoryCompare = useUiStore((state) => state.inventoryCompare);
  const reservationAudit = useUiStore((state) => state.reservationAudit);
  const authBundleSettingsSnapshot = useUiStore((state) => state.authBundleSettingsSnapshot);
  const openWingsLogin = useUiStore((state) => state.openWingsLogin);
  const captureWingsSession = useUiStore((state) => state.captureWingsSession);
  const setManualScanAnchorDraft = useUiStore((state) => state.setManualScanAnchorDraft);
  const saveManualScanAnchorDraft = useUiStore((state) => state.saveManualScanAnchorDraft);
  const deleteManualScanAnchorDraft = useUiStore((state) => state.deleteManualScanAnchorDraft);
  const saveManualBindingDecision = useUiStore((state) => state.saveManualBindingDecision);
  const deleteManualBindingDecision = useUiStore((state) => state.deleteManualBindingDecision);
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
        {sheetRead.summary ? (
          <>
            <div className="process-grid process-grid-compact">
              <article className="process-card tone-default">
                <span>시트 판정</span>
                <strong>{sheetRead.summary.failureCategory === "none" ? "정상" : sheetRead.summary.failureCategory}</strong>
                <p>{sheetRead.summary.retryReason ? `재시도 ${sheetRead.summary.retryReason}` : "재시도 없음"}</p>
              </article>
              <article className="process-card tone-default">
                <span>스캔 범위</span>
                <strong>{sheetRead.summary.readMode || "unknown"}</strong>
                <p>validation {sheetRead.summary.validationSummary.issueCount}건</p>
              </article>
              <article className="process-card tone-default">
                <span>앵커 힌트</span>
                <strong>
                  NR {sheetRead.summary.anchorSummary.namedRangeCount} / MD {sheetRead.summary.anchorSummary.metadataCount}
                </strong>
                <p>room map {sheetRead.summary.hintSummary.roomMapCount}건</p>
              </article>
            </div>
            <div className="simple-status-grid">
              <article className="simple-status-card">
                <span>선택된 run</span>
                <strong>{sheetRead.selectedRunId || "없음"}</strong>
              </article>
              <article className="simple-status-card">
                <span>가시 슬라이스</span>
                <strong>
                  {sheetRead.visibleSlice.total > 0
                    ? `${sheetRead.visibleSlice.offset + 1}-${Math.min(
                        sheetRead.visibleSlice.offset + sheetRead.visibleSlice.lines.length,
                        sheetRead.visibleSlice.total
                      )}`
                    : "0"}
                </strong>
                <p>총 {sheetRead.visibleSlice.total}줄</p>
              </article>
              <article className="simple-status-card">
                <span>미해결 매핑</span>
                <strong>{unresolvedBindings.length}건</strong>
                <p>{unresolvedBindings[0]?.reason || "현재 없음"}</p>
              </article>
              <article className="simple-status-card">
                <span>적용된 결정</span>
                <strong>{termBindings.filter((item) => item.method === "manual").length}건</strong>
                <p>{termBindings[0]?.termId || "현재 없음"}</p>
              </article>
            </div>
            {sheetRead.visibleSlice.lines.length > 0 ? (
              <div className="data-list">
                {sheetRead.visibleSlice.lines.map((line, index) => (
                  <div key={`${sheetRead.visibleSlice.offset + index}:${line}`} className="data-row">
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {unresolvedBindings.length > 0 ? (
              <div className="data-list">
                {unresolvedBindings.slice(0, 3).map((item) => (
                  <div key={item.anchorId} className="data-row">
                    <div>
                      <span>{`${item.reason} | ${item.rawHeader}`}</span>
                      <div className="settings-actions">
                        {item.candidateTerms.map((termId) => (
                          <button
                            key={`${item.anchorId}:${termId}`}
                            type="button"
                            className="action-button"
                            onClick={() => void saveManualBindingDecision(item.anchorId, termId)}
                          >
                            {termId}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {termBindings.length > 0 ? (
              <div className="data-list">
                {termBindings
                  .filter((item) => item.method === "manual")
                  .slice(0, 3)
                  .map((item) => (
                    <div key={item.decisionKey || `${item.anchorId}:${item.termId}`} className="data-row">
                      <div>
                        <span>{`${item.termId} | ${item.rawHeader || item.anchorId}`}</span>
                        {item.decisionKey ? (
                          <div className="settings-actions">
                            <button
                              type="button"
                              className="action-button"
                              onClick={() => void deleteManualBindingDecision(item.decisionKey || "")}
                            >
                              결정 제거
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}
            <div className="process-grid process-grid-compact">
              <article className="process-card tone-default">
                <span>수동 범위 앵커</span>
                <strong>{manualScanAnchor ? "적용 중" : "없음"}</strong>
                <p>{manualScanAnchor?.updatedAt || "auto scan only"}</p>
              </article>
            </div>
            <div className="settings-actions" style={{ flexWrap: "wrap" }}>
              <label>
                날짜 행
                <input
                  type="number"
                  min={1}
                  value={toInputValue(manualScanAnchorDraft.dateRow)}
                  onChange={(event) =>
                    setManualScanAnchorDraft({ dateRow: event.target.value ? Number(event.target.value) : null })
                  }
                />
              </label>
              <label>
                객실 시작 행
                <input
                  type="number"
                  min={1}
                  value={toInputValue(manualScanAnchorDraft.roomStartRow)}
                  onChange={(event) =>
                    setManualScanAnchorDraft({ roomStartRow: event.target.value ? Number(event.target.value) : null })
                  }
                />
              </label>
              <label>
                재고 탐색 시작 행
                <input
                  type="number"
                  min={1}
                  value={toInputValue(manualScanAnchorDraft.inventorySearchStartRow)}
                  onChange={(event) =>
                    setManualScanAnchorDraft({
                      inventorySearchStartRow: event.target.value ? Number(event.target.value) : null
                    })
                  }
                />
              </label>
              <label>
                네이버 재고 행
                <input
                  type="number"
                  min={1}
                  value={toInputValue(manualScanAnchorDraft.naverInventoryRow)}
                  onChange={(event) =>
                    setManualScanAnchorDraft({ naverInventoryRow: event.target.value ? Number(event.target.value) : null })
                  }
                />
              </label>
              <label>
                스테이션 재고 행
                <input
                  type="number"
                  min={1}
                  value={toInputValue(manualScanAnchorDraft.stationInventoryRow)}
                  onChange={(event) =>
                    setManualScanAnchorDraft({
                      stationInventoryRow: event.target.value ? Number(event.target.value) : null
                    })
                  }
                />
              </label>
            </div>
            <div className="settings-actions">
              <button type="button" className="action-button" onClick={() => void saveManualScanAnchorDraft()}>
                수동 앵커 저장 후 재조회
              </button>
              <button type="button" className="action-button" onClick={() => void deleteManualScanAnchorDraft()}>
                수동 앵커 제거
              </button>
            </div>
          </>
        ) : null}
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
