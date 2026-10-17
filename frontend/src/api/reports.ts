import { ApiError, apiRequest, apiUpload } from './client';
import type { UploadProgress } from './client';
import { parseReportReceipt } from '../features/report/receipt';
import type { ReportReceipt } from '../features/report/receipt';

export interface ReportSubmissionInput {
  operator: string | null;
  deviceId: string | null;
  qrRawData: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  categories: string[];
  additionalDescription: string;
  finalReportText: string;
  phone: string | null;
  consent: boolean;
  reportConfirmed: true;
}

export interface ReportServiceStatus { available: boolean; mode: 'local' | 's3' | 'disabled' }

export async function getReportServiceStatus(signal: AbortSignal): Promise<ReportServiceStatus> {
  const status = await apiRequest<ReportServiceStatus>('/reports/status', { signal });
  if (!status || typeof status.available !== 'boolean' || !['local', 's3', 'disabled'].includes(status.mode)) {
    throw new ApiError('신고 접수 가능 여부를 확인하지 못했어요.', 0, 'INVALID_RESPONSE');
  }
  return status;
}

export async function submitReport(input: ReportSubmissionInput, submissionId: string, photos: File[], signal: AbortSignal, onProgress?: (progress: UploadProgress) => void): Promise<ReportReceipt> {
  const form = new FormData();
  // Explicit allowlist: AI metadata and client-side routing/tenant fields never leave the browser.
  form.append('report', JSON.stringify({
    submissionId, operator: input.operator, deviceId: input.deviceId, qrRawData: input.qrRawData,
    latitude: input.latitude, longitude: input.longitude, address: input.address,
    categories: input.categories, additionalDescription: input.additionalDescription,
    finalReportText: input.finalReportText, phone: input.phone, consent: input.consent,
    reportConfirmed: input.reportConfirmed,
  }));
  for (const photo of photos) form.append('photos', photo, photo.name);
  const response: unknown = await apiUpload('/reports', form, { signal, timeoutMs: 300_000, onProgress });
  const receipt = parseReportReceipt(response);
  if (!receipt) throw new ApiError('접수 결과를 확인하지 못했어요. 같은 내용으로 다시 제출해 확인해 주세요.', 0, 'INVALID_RESPONSE');
  return receipt;
}
