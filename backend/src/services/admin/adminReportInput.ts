import { z } from 'zod';
import { ApiError } from '../../middleware/errors.js';
import type { AdminProfile } from '../../types/admin.js';

export const adminReportQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['RECEIVED', 'PROCESSING', 'COMPLETED', 'REJECTED']).optional(),
  q: z.string().trim().max(100).refine(value => !value.includes('\0')).default(''),
});
export const adminReportMapQuery = adminReportQuery.extend({
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
});
const coordinate = z.union([z.number(), z.string().trim().min(1).transform(Number)]).pipe(z.number().finite());
export const adminNearbyReportQuery = z.strictObject({
  latitude: coordinate.pipe(z.number().min(-90).max(90)),
  longitude: coordinate.pipe(z.number().min(-180).max(180)),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
});
export const adminReportTransition = z.strictObject({
  status: z.enum(['PROCESSING', 'COMPLETED', 'REJECTED']),
  completionMethod: z.enum(['COLLECTED', 'TOWED']).optional(),
  publicNote: z.string().trim().max(1000).refine(value => !value.includes('\0')).optional(),
  internalNote: z.string().trim().max(1000).refine(value => !value.includes('\0')).optional(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
}).superRefine((input, context) => {
  if ((input.status === 'COMPLETED') !== (input.completionMethod !== undefined)) {
    context.addIssue({ code: 'custom', path: ['completionMethod'], message: '완료 처리에만 수거 또는 견인 방법을 지정하세요.' });
  }
});
export const adminRelatedReportTransition = z.strictObject({
  status: z.literal('COMPLETED'),
  completionMethod: z.enum(['COLLECTED', 'TOWED']),
  reports: z.array(z.strictObject({
    publicId: z.string().regex(/^PK-\d{8}-[a-f0-9]{12}$/),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
  })).min(2).max(100).refine(reports => new Set(reports.map(report => report.publicId)).size === reports.length),
  publicNote: z.string().trim().max(1000).refine(value => !value.includes('\0')).optional(),
  internalNote: z.string().trim().max(1000).refine(value => !value.includes('\0')).optional(),
});
export type AdminReportQuery = z.infer<typeof adminReportQuery>;
export type AdminReportMapQuery = z.infer<typeof adminReportMapQuery>;
export type AdminNearbyReportQuery = z.infer<typeof adminNearbyReportQuery>;
export type AdminReportTransition = z.infer<typeof adminReportTransition>;
export type AdminRelatedReportTransition = z.infer<typeof adminRelatedReportTransition>;
export type ReportStatus = 'RECEIVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
export type CompletionMethod = 'COLLECTED' | 'TOWED';
export interface AdminReportSummary {
  publicId: string; createdAt: string; updatedAt: string; status: ReportStatus;
  completionMethod: CompletionMethod | null; completedAt: string | null;
  operatorName: string | null; deviceId: string | null; address: string | null;
  categories: string[]; tenant: { id: string; name: string }; region: { id: string; name: string };
}
export interface AdminReportDetail extends AdminReportSummary {
  latitude: number; longitude: number; finalReportText: string; userDescription: string | null;
  contactPhoneMasked: string | null; images: { id: string; url: string }[];
  history: { id: string; status: ReportStatus; createdAt: string; completionMethod: CompletionMethod | null;
    publicNote: string | null; internalNote: string | null; adminName: string | null }[];
}
export interface AdminReportMapItem extends AdminReportSummary { latitude: number; longitude: number }
export interface AdminNearbyReportItem extends AdminReportMapItem { distanceMeters: number }
export interface AdminRelatedReports {
  anchorPublicId: string; eligible: boolean;
  reason: 'ANCHOR_COMPLETED' | 'ANCHOR_REJECTED' | 'IDENTITY_UNKNOWN' | 'CANDIDATE_LIMIT' | null;
  criteria: { distanceMeters: 100; timeWindowHours: 24; maxSelection: 100 };
  items: (AdminReportSummary & { distanceMeters: number })[];
  truncated: boolean;
}
export interface AdminRelatedReportResult { anchorPublicId: string; items: AdminReportSummary[]; replayed: boolean }
export interface AdminReportScope { adminId: string; role: 'PLATFORM_ADMIN' | 'TENANT_ADMIN'; tenantId: string | null }
export function reportScope(admin: AdminProfile): AdminReportScope | null {
  if (!admin.role) return null;
  if (admin.role === 'PLATFORM_ADMIN' && admin.tenantId === null) return { adminId: admin.id, role: admin.role, tenantId: null };
  if (admin.role === 'TENANT_ADMIN' && typeof admin.tenantId === 'string' && admin.tenantId) return { adminId: admin.id, role: admin.role, tenantId: admin.tenantId };
  throw new ApiError(403, 'ADMIN_SCOPE_REQUIRED', '관리자 권한 범위를 확인해주세요.');
}
