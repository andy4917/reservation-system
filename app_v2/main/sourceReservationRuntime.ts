import fs from "node:fs/promises";
import path from "node:path";

interface PmsReservationRecord {
  reservationNo?: unknown;
  channel?: unknown;
  checkin?: unknown;
  checkout?: unknown;
  nights?: unknown;
  roomNo?: unknown;
  price?: unknown;
  account?: unknown;
  status?: unknown;
  statusBucket?: unknown;
  auditAnomaly?: unknown;
  branch?: unknown;
  reservationRef?: unknown;
  nationalityNights?: unknown;
  sourceCode?: unknown;
}

export interface SourceReservationFixtureRow {
  source_system: string;
  reservation_no: string;
  channel: string;
  checkin: string;
  checkout: string;
  nights: number;
  room_no: string;
  price: number | null;
  account: string;
  status: string;
  status_bucket: string;
  audit_anomaly: boolean;
  branch: string;
  reservation_ref: string;
  nationality_nights: string;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeNullablePrice(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeStatusBucket(record: PmsReservationRecord) {
  const statusBucket = normalizeText(record.statusBucket).toUpperCase();
  if (statusBucket) return statusBucket;
  const status = normalizeText(record.status).toUpperCase();
  if (status === "CX" || status === "CXL" || status === "CANCELED") return "CANCELED";
  return "ACTIVE";
}

export function buildSourceReservationsFromPmsRecords(
  records: PmsReservationRecord[],
  sourceSystem = "PMS",
): SourceReservationFixtureRow[] {
  return (Array.isArray(records) ? records : [])
    .map((record) => {
      const reservationNo = normalizeText(record.reservationNo);
      if (!reservationNo) return null;
      return {
        source_system: normalizeText(sourceSystem).toUpperCase() || "PMS",
        reservation_no: reservationNo,
        channel: normalizeText(record.sourceCode) || normalizeText(record.channel),
        checkin: normalizeText(record.checkin),
        checkout: normalizeText(record.checkout),
        nights: Math.max(0, normalizeNumber(record.nights)),
        room_no: normalizeText(record.roomNo),
        price: normalizeNullablePrice(record.price),
        account: normalizeText(record.account),
        status: normalizeText(record.status),
        status_bucket: normalizeStatusBucket(record),
        audit_anomaly: record.auditAnomaly === true,
        branch: normalizeText(record.branch),
        reservation_ref: normalizeText(record.reservationRef),
        nationality_nights: normalizeText(record.nationalityNights),
      };
    })
    .filter((row): row is SourceReservationFixtureRow => Boolean(row));
}

export async function writeSourceReservationsFixture(rows: SourceReservationFixtureRow[], outDir: string) {
  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, "source-reservations.json");
  await fs.writeFile(filePath, JSON.stringify(rows, null, 2), "utf8");
  return {
    path: filePath,
    count: rows.length,
  };
}
