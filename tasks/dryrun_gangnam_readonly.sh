#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

START_DATE="${1:-$(date +%Y-%m-%d)}"
END_DATE="${2:-$(date -d "$START_DATE +7 day" +%Y-%m-%d)}"
RUN_TAG="${3:-$(date +%Y%m%d_%H%M%S)}"

STATION_HAR="${STATION_HAR:-}"
PMS_HAR="${PMS_HAR:-}"

if [[ -z "$STATION_HAR" || -z "$PMS_HAR" ]]; then
  echo "Set STATION_HAR and PMS_HAR before running this dry-run." >&2
  exit 2
fi

SYNC_OUT="output_review/live_sync_station_gangnam_${RUN_TAG}"
ANALYZE_OUT="output_review/live_analyze_sheet_vs_wings_gangnam_scope_${RUN_TAG}"

echo "[1/2] Station read-only sync dry-run (NAVER excluded)"
python3 reservation_sheet_sync.py \
  --provider station \
  --station-branch-id 16 \
  --station-room-ids 94,97,99,386 \
  --station-har "$STATION_HAR" \
  --sync-start-date "$START_DATE" \
  --sync-end-date "$END_DATE" \
  --out-dir "$SYNC_OUT"

echo "[2/2] Wings(PMS HAR) cross validation + orderlist/arrival (GANGNAM scope)"
python3 reservation_sheet_audit.py analyze \
  --report-start-date "$START_DATE" \
  --report-end-date "$END_DATE" \
  --sheet-branch-scope GANGNAM \
  --pms-file "$PMS_HAR" \
  --pms-branch-map "91=GANGNAM" \
  --out-dir "$ANALYZE_OUT"

echo
echo "Done."
echo "- sync summary:    $SYNC_OUT/sync_inventory_summary.json"
echo "- analyze summary: $ANALYZE_OUT/summary.json"
