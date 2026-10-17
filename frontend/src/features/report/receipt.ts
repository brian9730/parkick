import { isValidCoordinates } from '../map/location';

export interface ReportReceipt {
  publicId: string;
  status: 'RECEIVED';
  createdAt: string;
  address: string | null;
  latitude: number;
  longitude: number;
  hasContact: boolean;
}

const STORAGE_KEY = 'parkick.report-receipt.v1';

/** Keep only the server receipt, never the draft, phone, QR, or photo contents. */
export function parseReportReceipt(value: unknown): ReportReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const receipt = value as Record<string, unknown>;
  if (typeof receipt.publicId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(receipt.publicId)
    || receipt.status !== 'RECEIVED'
    || typeof receipt.createdAt !== 'string' || receipt.createdAt.length > 40
    || !/^\d{4}-\d{2}-\d{2}T/.test(receipt.createdAt) || !Number.isFinite(Date.parse(receipt.createdAt))
    || (receipt.address !== null && (typeof receipt.address !== 'string' || receipt.address.length > 300))
    || typeof receipt.latitude !== 'number' || typeof receipt.longitude !== 'number'
    || !isValidCoordinates(receipt.latitude, receipt.longitude)
    || typeof receipt.hasContact !== 'boolean') return null;
  return {
    publicId: receipt.publicId, status: receipt.status, createdAt: receipt.createdAt,
    address: receipt.address as string | null, latitude: receipt.latitude,
    longitude: receipt.longitude, hasContact: receipt.hasContact,
  };
}

export function saveReportReceipt(receipt: ReportReceipt): void {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(receipt)); } catch { /* The current completion page still receives its receipt via route state. */ }
}

export function readReportReceipt(): ReportReceipt | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? parseReportReceipt(JSON.parse(stored)) : null;
  } catch { return null; }
}
