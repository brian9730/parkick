import { apiRequest } from './client';

export interface Admin {
  id: string;
  email: string;
  name: string;
  role?: 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'COLLECTOR';
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
  hasPendingFieldFinding?: boolean;
}
export interface FieldFinding {
  id: string;
  type: 'DEVICE_NOT_FOUND';
  note: string;
  createdAt: string;
  status: 'PENDING_REVIEW' | 'REVIEWED';
  collectorName: string;
  reviewedAt: string | null;
  reviewerName: string | null;
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
  fieldFindings?: FieldFinding[];
}
export type CollectionReportDetail = Omit<AdminReportDetail, 'contactPhoneMasked' | 'history' | 'fieldFindings'> & {
  fieldFindings: Pick<FieldFinding, 'id' | 'type' | 'note' | 'status' | 'createdAt'>[];
  history: { id: string; status: AdminReportStatus; createdAt: string; completionMethod: AdminCompletionMethod | null; publicNote: string | null }[];
};
export interface Dashboard {
  mode: 'database' | 'skeleton';
  summary: { today: number | null; total: number | null; received: number | null; processing: number | null; completed: number | null; rejected: number | null };
  recentReports: AdminReportSummary[];
}
export interface ReportList { mode: 'database' | 'skeleton'; items: AdminReportSummary[]; total: number; page: number; pageSize: number }
export interface AdminMapReport extends AdminReportSummary { latitude: number; longitude: number }
export interface ReportMapList { mode: 'database' | 'skeleton'; items: AdminMapReport[]; total: number; page: number; pageSize: number }
export interface AdminHotspotZone { latitude: number; longitude: number; count: number; level: 'red' | 'yellow'; radiusMeters: number }
export interface AdminHotspots { mode: 'database' | 'skeleton'; zones: AdminHotspotZone[]; totalReports: number }
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
  reportHotspots: (filters: Pick<ReportFilters, 'status' | 'q'>, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (filters.status) query.set('status', filters.status);
    if (filters.q) query.set('q', filters.q);
    const search = query.toString();
    return apiRequest<AdminHotspots>(`/admin/reports/hotspots${search ? `?${search}` : ''}`, { signal });
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

const collectionReportPath = (publicId: string) => `/admin/collection/reports/${encodeURIComponent(publicId)}`;

export const collectionApi = {
  nearbyReports: (filters: NearbyReportFilters, signal?: AbortSignal) => {
    const query = new URLSearchParams({
      latitude: String(filters.latitude), longitude: String(filters.longitude),
      page: String(filters.page), pageSize: String(filters.pageSize),
    });
    return apiRequest<NearbyReportList>(`/admin/collection/reports/nearby?${query}`, { signal });
  },
  report: (publicId: string, signal?: AbortSignal) => apiRequest<CollectionReportDetail>(collectionReportPath(publicId), { signal }),
  complete: (publicId: string, expectedUpdatedAt: string) => apiRequest<CollectionReportDetail>(`${collectionReportPath(publicId)}/complete`, {
    method: 'PATCH', body: JSON.stringify({ expectedUpdatedAt }),
  }),
  missing: (publicId: string, expectedUpdatedAt: string, note: string) => apiRequest<CollectionReportDetail>(`${collectionReportPath(publicId)}/missing`, {
    method: 'POST', body: JSON.stringify({ expectedUpdatedAt, note }),
  }),
};
