import { ApiError, apiRequest, apiUpload } from './client';
import type { UploadProgress } from './client';
import { parseReportReceipt } from '../features/report/receipt';
import type { ReportReceipt } from '../features/report/receipt';

export interface ReportSubmissionInput {
  operator: string;
  deviceId: string;
  qrRawData: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  categories: string[];
  additionalDescription: string;
  phone: string | null;
  consent: boolean;
}

export interface ReportServiceStatus { available: boolean; mode: 'local' | 's3' | 'disabled'; photoValidation?: 'bedrock' | 'litellm' | 'mock' | 'disabled' }

export async function getReportServiceStatus(signal: AbortSignal): Promise<ReportServiceStatus> {
  const status = await apiRequest<ReportServiceStatus>('/reports/status', { signal });
  if (!status || typeof status.available !== 'boolean' || !['local', 's3', 'disabled'].includes(status.mode)) {
    throw new ApiError('신고 접수 가능 여부를 확인하지 못했어요.', 0, 'INVALID_RESPONSE');
  }
  return status;
}

/** The server checks image format and, when enabled, relevance through an image AI provider. */
export async function validateReportPhotos(photos: File[], signal: AbortSignal): Promise<void> {
  const form = new FormData();
  for (const photo of photos) form.append('photos', photo, photo.name);
  const result = await apiUpload<{ valid: boolean; photoValidation?: ReportServiceStatus['photoValidation'] }>('/reports/validate-photos', form, { signal, timeoutMs: 120_000 });
  if (result?.valid !== true) throw new ApiError('사진 검사 결과를 확인할 수 없습니다. 다시 시도해 주세요.', 0, 'INVALID_RESPONSE');
}

export async function submitReport(input: ReportSubmissionInput, submissionId: string, photos: File[], signal: AbortSignal, onProgress?: (progress: UploadProgress) => void): Promise<ReportReceipt> {
  const form = new FormData();
  // Explicit allowlist: AI metadata and client-side routing/tenant fields never leave the browser.
  form.append('report', JSON.stringify({
    submissionId, operator: input.operator, deviceId: input.deviceId, qrRawData: input.qrRawData,
    latitude: input.latitude, longitude: input.longitude, address: input.address,
    categories: input.categories, additionalDescription: input.additionalDescription,
    phone: input.phone, consent: input.consent,
  }));
  for (const photo of photos) form.append('photos', photo, photo.name);
  const response: unknown = await apiUpload('/reports', form, { signal, timeoutMs: 300_000, onProgress });
  const receipt = parseReportReceipt(response);
  if (!receipt) throw new ApiError('접수 결과를 확인하지 못했어요. 같은 내용으로 다시 제출해 확인해 주세요.', 0, 'INVALID_RESPONSE');
  return receipt;
}
