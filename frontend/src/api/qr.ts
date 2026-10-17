import { apiRequest } from './client';

export interface QrParseResult {
  rawQr: string;
  operatorId: string | null;
  operatorName: string | null;
  deviceId: string | null;
  parserId: string;
  matched: boolean;
  source: 'unknown' | 'registered-parser' | 'operator-selection';
  reason: 'UNVERIFIED_QR_FORMAT' | null;
}

export function parseQr(rawQr: string, selectedOperatorId?: string): Promise<QrParseResult> {
  return apiRequest<QrParseResult>('/qr/parse', { method: 'POST', body: JSON.stringify({ rawQr, ...(selectedOperatorId ? { selectedOperatorId } : {}) }) });
}
