import { z } from 'zod';

export const REPORT_LOOKUP_PAGE_SIZE = 20;
export const REPORT_LOOKUP_MAX_PAGE = 1000;
export const PHONE_LOOKUP_KEY_VERSION = 'local-v1';

const phone = z.string().trim().max(13).regex(/^(?:010\d{8}|010-\d{4}-\d{4})$/)
  .transform(value => value.replace(/-/g, ''));

export const reportLookupListSchema = z.strictObject({
  phone,
  page: z.number().int().min(1).max(REPORT_LOOKUP_MAX_PAGE).default(1),
});
export const reportLookupDetailSchema = z.strictObject({ phone });
export const reportPublicIdSchema = z.string().regex(/^PK-\d{8}-[a-f0-9]{12}$/);

export interface PublicReportSummary {
  publicId: string;
  createdAt: string;
  operatorName: string | null;
  categories: string[];
  status: 'RECEIVED' | 'PROCESSING' | 'COMPLETED';
  completionMethod: 'COLLECTED' | 'TOWED' | null;
  completedAt: string | null;
}

export interface PublicReportHistory {
  status: PublicReportSummary['status'];
  createdAt: string;
  completionMethod: PublicReportSummary['completionMethod'];
  publicNote: string | null;
}

export interface PublicReportDetail extends PublicReportSummary { history: PublicReportHistory[] }
export interface PublicReportList {
  items: PublicReportSummary[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}
