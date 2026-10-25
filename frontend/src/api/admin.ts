import { apiRequest } from './client';

export interface Admin {
  id: string;
  email: string;
  name: string;
  role?: 'PLATFORM_ADMIN' | 'TENANT_ADMIN';
  tenantId?: string | null;
}
export interface Session { admin: Admin; mode: 'database' | 'development-mock' }
export type AdminReportStatus = 'RECEIVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
export type AdminCompletionMethod = 'COLLECTED' | 'TOWED';
export interface AdminReportSummary {
  publicId: string;
  createdAt: string;
  updatedAt: string;
  status: AdminReportStatus;
  completionMethod: AdminCompletionMethod | null;
  completedAt: string | null;
  operatorName: string | null;
  deviceId: string | null;
  address: string | null;
  categories: string[];
  tenant: { id: string; name: string };
  region: { id: string; name: string };
}
export interface AdminReportDetail extends AdminReportSummary {
  latitude: number;
  longitude: number;
  finalReportText: string;
  userDescription: string | null;
  contactPhoneMasked: string | null;
  images: { id: string; url: string }[];
  history: {
    id: string;
    status: AdminReportStatus;
    createdAt: string;
    completionMethod: AdminCompletionMethod | null;
    publicNote: string | null;
    internalNote: string | null;
    adminName: string | null;
  }[];
}
export interface Dashboard {
  mode: 'database' | 'skeleton';
  summary: { today: number | null; total: number | null; received: number | null; processing: number | null; completed: number | null; rejected: number | null };
  recentReports: AdminReportSummary[];
}
export interface ReportList { mode: 'database' | 'skeleton'; items: AdminReportSummary[]; total: number; page: number; pageSize: number }
export interface AdminMapReport extends AdminReportSummary { latitude: number; longitude: number }
export interface ReportMapList { mode: 'database' | 'skeleton'; items: AdminMapReport[]; total: number; page: number; pageSize: number }
export interface NearbyReport extends AdminMapReport { distanceMeters: number }
export interface NearbyReportList { mode: 'database' | 'skeleton'; items: NearbyReport[]; total: number; page: number; pageSize: number }
export interface NearbyReportFilters { latitude: number; longitude: number; page: number; pageSize: number }
export interface ReportFilters { page: number; pageSize: number; status: AdminReportStatus | ''; q: string }
export interface ReportStatusUpdate {
  status: 'REJECTED' | 'COMPLETED';
  completionMethod?: AdminCompletionMethod;
  publicNote?: string;
  internalNote?: string;
  expectedUpdatedAt: string;
}
export interface RelatedReports {
  anchorPublicId: string;
  eligible: boolean;
  reason: 'ANCHOR_COMPLETED' | 'ANCHOR_REJECTED' | 'IDENTITY_UNKNOWN' | 'CANDIDATE_LIMIT' | null;
  criteria: { distanceMeters: number; timeWindowHours: number; maxSelection: number };
  items: (AdminReportSummary & { distanceMeters: number })[];
  truncated: boolean;
}
export interface RelatedReportStatusUpdate {
  status: 'COMPLETED';
  completionMethod: AdminCompletionMethod;
  reports: { publicId: string; expectedUpdatedAt: string }[];
  publicNote?: string;
  internalNote?: string;
}
export interface RelatedReportStatusResult {
  anchorPublicId: string;
  items: AdminReportSummary[];
  replayed: boolean;
}

export const adminApi = {
  session: () => apiRequest<Session>('/admin/auth/me'),
  login: (email: string, password: string) => apiRequest<Session>('/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => apiRequest<void>('/admin/auth/logout', { method: 'POST', body: '{}' }),
  dashboard: (signal?: AbortSignal) => apiRequest<Dashboard>('/admin/dashboard', { signal }),
  reports: (filters: ReportFilters, signal?: AbortSignal) => {
    const query = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize) });
    if (filters.status) query.set('status', filters.status);
    if (filters.q) query.set('q', filters.q);
    return apiRequest<ReportList>(`/admin/reports?${query}`, { signal });
  },
  reportMap: (filters: ReportFilters, signal?: AbortSignal) => {
    const query = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize) });
    if (filters.status) query.set('status', filters.status);
    if (filters.q) query.set('q', filters.q);
    return apiRequest<ReportMapList>(`/admin/reports/map?${query}`, { signal });
  },
  nearbyReports: (filters: NearbyReportFilters, signal?: AbortSignal) => {
    const query = new URLSearchParams({
      latitude: String(filters.latitude), longitude: String(filters.longitude),
      page: String(filters.page), pageSize: String(filters.pageSize),
    });
    return apiRequest<NearbyReportList>(`/admin/reports/nearby?${query}`, { signal });
  },
  report: (publicId: string, signal?: AbortSignal) => apiRequest<AdminReportDetail>(`/admin/reports/${encodeURIComponent(publicId)}`, { signal }),
  updateReport: (publicId: string, update: ReportStatusUpdate) => apiRequest<AdminReportDetail>(`/admin/reports/${encodeURIComponent(publicId)}/status`, { method: 'PATCH', body: JSON.stringify(update) }),
  relatedReports: (publicId: string, signal?: AbortSignal) => apiRequest<RelatedReports>(`/admin/reports/${encodeURIComponent(publicId)}/related`, { signal }),
  updateRelatedReports: (publicId: string, update: RelatedReportStatusUpdate) => apiRequest<RelatedReportStatusResult>(`/admin/reports/${encodeURIComponent(publicId)}/related/status`, { method: 'PATCH', body: JSON.stringify(update) }),
};
