import { useUiStore } from "../state/uiStore";

export function StatusBanner() {
  const bridgeStatus = useUiStore((state) => state.bridgeStatus);
  const sheetRead = useUiStore((state) => state.sheetRead);
  const inventoryCompare = useUiStore((state) => state.inventoryCompare);
  const reservationAudit = useUiStore((state) => state.reservationAudit);

  return (
    <section className="status-banner">
      <div className="status-group">
        <span className="status-kicker">확장</span>
        <strong>{bridgeStatus.sessionAvailable ? "연결됨" : "연결 필요"}</strong>
      </div>
      <div className="status-group">
        <span className="status-kicker">재고 조회</span>
        <strong>{inventoryCompare.supportLevel === "read-live" ? "실시간" : "예시 데이터"}</strong>
      </div>
      <div className="status-group">
        <span className="status-kicker">예약 점검</span>
        <strong>{reservationAudit.supportLevel === "read-live" ? "실시간" : "예시 데이터"}</strong>
      </div>
      <div className="status-group">
        <span className="status-kicker">시트</span>
        <strong>{sheetRead.supportLevel === "read-live" ? "연결됨" : "대기 중"}</strong>
      </div>
    </section>
  );
}
