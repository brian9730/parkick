import { ApiError, apiRequest } from './client';

export type PublicReportStatus = 'RECEIVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
export type PublicCompletionMethod = 'COLLECTED' | 'TOWED' | null;
export interface PublicReportSummary {
  publicId: string;
  createdAt: string;
  operatorName: string | null;
  categories: string[];
  status: PublicReportStatus;
  completionMethod: PublicCompletionMethod;
  completedAt: string | null;
}
export interface ReportLookupResult {
  items: PublicReportSummary[];
  page: number;
  pageSize: 20;
  hasMore: boolean;
}
export interface PublicReportHistory {
  status: PublicReportStatus;
  createdAt: string;
  completionMethod: PublicCompletionMethod;
  publicNote: string | null;
}
export interface PublicReportDetail extends PublicReportSummary { history: PublicReportHistory[] }

const invalidResponse = () => new ApiError('조회 결과를 확인하지 못했어요. 잠시 후 다시 조회해 주세요.', 0, 'INVALID_RESPONSE');
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isStatus = (value: unknown): value is PublicReportStatus => value === 'RECEIVED' || value === 'PROCESSING' || value === 'COMPLETED' || value === 'REJECTED';
const isCompletionMethod = (value: unknown): value is PublicCompletionMethod => value === null || value === 'COLLECTED' || value === 'TOWED';
const isDate = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

function parseSummary(value: unknown): PublicReportSummary {
  if (!isRecord(value) || typeof value.publicId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.publicId)
    || !isDate(value.createdAt) || !isStatus(value.status) || !isCompletionMethod(value.completionMethod)
    || (value.operatorName !== null && typeof value.operatorName !== 'string')
    || (value.completedAt !== null && !isDate(value.completedAt))
    || !Array.isArray(value.categories) || !value.categories.every(category => typeof category === 'string')) throw invalidResponse();
  // Explicit public fields only. Neither responses nor phone numbers are persisted.
  return {
    publicId: value.publicId, createdAt: value.createdAt, operatorName: value.operatorName,
    categories: [...value.categories] as string[], status: value.status,
    completionMethod: value.completionMethod, completedAt: value.completedAt,
  };
}

export async function lookupReports(phone: string, page: number, signal: AbortSignal): Promise<ReportLookupResult> {
  const result: unknown = await apiRequest('/reports/lookup', {
    method: 'POST', body: JSON.stringify({ phone, page }), signal, cache: 'no-store',
  });
  if (!isRecord(result) || !Array.isArray(result.items) || result.items.length > 20
    || result.page !== page || result.pageSize !== 20 || typeof result.hasMore !== 'boolean') throw invalidResponse();
  return { items: result.items.map(parseSummary), page, pageSize: 20, hasMore: result.hasMore };
}

export async function lookupReportDetail(publicId: string, phone: string, signal: AbortSignal): Promise<PublicReportDetail> {
  const result: unknown = await apiRequest(`/reports/lookup/${encodeURIComponent(publicId)}`, {
    method: 'POST', body: JSON.stringify({ phone }), signal, cache: 'no-store',
  });
  const summary = parseSummary(result);
  if (summary.publicId !== publicId || !isRecord(result) || !Array.isArray(result.history)) throw invalidResponse();
  const history = result.history.map((entry: unknown): PublicReportHistory => {
    if (!isRecord(entry) || !isStatus(entry.status) || !isDate(entry.createdAt)
      || !isCompletionMethod(entry.completionMethod)
      || (entry.publicNote !== null && typeof entry.publicNote !== 'string')) throw invalidResponse();
    return { status: entry.status, createdAt: entry.createdAt, completionMethod: entry.completionMethod, publicNote: entry.publicNote };
  });
  return { ...summary, history };
}

export function reportLookupError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return '조회 요청이 많아요. 잠시 후 다시 시도해 주세요.';
    if (error.status === 404) return '해당 번호로 조회할 수 있는 신고가 없어요. 번호와 접수번호를 확인해 주세요.';
    if (error.status === 503) return '지금은 신고내역을 조회할 수 없어요. 잠시 후 다시 시도해 주세요.';
    if (error.status === 0 && error.code !== 'INVALID_RESPONSE') return '조회 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
    return error.message;
  }
  return '신고내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
}
