import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { matchingOperatorAliases, normalizeOperatorName } from '../catalog/operators.js';
import { ApiError } from '../middleware/errors.js';
import type { AdminNearbyReportItem, AdminNearbyReportQuery, AdminReportDetail, AdminReportHotspotQuery, AdminReportQuery, AdminReportScope, AdminReportSummary, AdminReportTransition, CollectorCompletion, CollectorMissing, CollectorReportDetail } from '../services/admin/adminReportInput.js';
import { adminReportMapQuery, type AdminReportMapItem, type AdminReportMapQuery } from '../services/admin/adminReportInput.js';
import { adminNearbyReportQuery, adminReportHotspotQuery } from '../services/admin/adminReportInput.js';
import { adminRelatedReportTransition, type AdminRelatedReports, type AdminRelatedReportResult, type AdminRelatedReportTransition } from '../services/admin/adminReportInput.js';
import { belongsToIncident, distanceMeters, knownIdentity, relatedHistoryId, RELATED_CRITERIA, RELATED_SCAN_LIMIT, RELATED_WINDOW_MS, sameIdentity, type RelatedFacts } from '../services/admin/relatedReportRules.js';
import { reportHotspots, type HotspotZone } from '../services/admin/reportHotspots.js';

export interface AdminDashboard {
  mode: 'database'; summary: { today: number; total: number; received: number; processing: number; completed: number; rejected: number };
  recentReports: AdminReportSummary[];
}
export interface AdminReportPage { mode: 'database'; items: AdminReportSummary[]; total: number; page: number; pageSize: number }
export interface AdminReportMapPage { mode: 'database'; items: AdminReportMapItem[]; total: number; page: number; pageSize: number }
export interface AdminReportHotspots { mode: 'database'; zones: HotspotZone[]; totalReports: number }
export interface AdminNearbyReportPage { mode: 'database'; items: AdminNearbyReportItem[]; total: number; page: number; pageSize: number }
export interface AdminReportRepository {
  dashboard(scope: AdminReportScope): Promise<AdminDashboard>;
  list(scope: AdminReportScope, query: AdminReportQuery): Promise<AdminReportPage>;
  map(scope: AdminReportScope, query: AdminReportMapQuery): Promise<AdminReportMapPage>;
  hotspots(scope: AdminReportScope, query: AdminReportHotspotQuery): Promise<AdminReportHotspots>;
  nearby(scope: AdminReportScope, query: AdminNearbyReportQuery): Promise<AdminNearbyReportPage>;
  detail(scope: AdminReportScope, publicId: string): Promise<AdminReportDetail>;
  image(scope: AdminReportScope, publicId: string, imageId: string): Promise<{ objectKey: string }>;
  transition(scope: AdminReportScope, publicId: string, input: AdminReportTransition): Promise<AdminReportDetail>;
  related(scope: AdminReportScope, publicId: string): Promise<AdminRelatedReports>;
  transitionRelated(scope: AdminReportScope, publicId: string, input: AdminRelatedReportTransition): Promise<AdminRelatedReportResult>;
  collectionMap(scope: AdminReportScope, query: AdminReportMapQuery): Promise<AdminReportMapPage>;
  collectionDetail(scope: AdminReportScope, publicId: string): Promise<CollectorReportDetail>;
  collectionImage(scope: AdminReportScope, publicId: string, imageId: string): Promise<{ objectKey: string }>;
  collectionComplete(scope: AdminReportScope, publicId: string, input: CollectorCompletion): Promise<CollectorReportDetail>;
  collectionMissing(scope: AdminReportScope, publicId: string, input: CollectorMissing): Promise<CollectorReportDetail>;
  close(): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicIdValid = (value: string) => /^PK-\d{8}-[a-f0-9]{12}$/.test(value);
function missing(): ApiError { return new ApiError(404, 'REPORT_NOT_FOUND', '신고 내역을 찾을 수 없습니다.'); }
function conflict(): ApiError { return new ApiError(409, 'REPORT_STATUS_CONFLICT', '신고 상태가 변경되었습니다. 새로고침 후 확인해주세요.'); }
function scoped(scope: AdminReportScope): Prisma.ReportWhereInput {
  if (!UUID.test(scope.adminId)) throw new ApiError(403, 'ADMIN_SCOPE_REQUIRED', '관리자 권한 범위를 확인해주세요.');
  if (scope.role === 'PLATFORM_ADMIN' && scope.tenantId === null) return {};
  if ((scope.role === 'TENANT_ADMIN' || scope.role === 'COLLECTOR') && typeof scope.tenantId === 'string' && UUID.test(scope.tenantId)) return { tenantId: scope.tenantId };
  throw new ApiError(403, 'ADMIN_SCOPE_REQUIRED', '관리자 권한 범위를 확인해주세요.');
}
function filtered(scope: AdminReportScope, query: Pick<AdminReportQuery, 'status' | 'q'>): Prisma.ReportWhereInput {
  const aliases = matchingOperatorAliases(query.q);
  return {
    ...scoped(scope), ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { OR: [
      ...['publicId', 'operatorName', 'deviceId', 'address'].map(field => ({ [field]: { contains: query.q, mode: 'insensitive' } })),
      ...(aliases.length ? [{ operatorName: { in: aliases, mode: 'insensitive' as const } }] : []),
    ] } : {}),
  };
}
const summarySelect = {
  publicId: true, createdAt: true, updatedAt: true, status: true, completionMethod: true, completedAt: true,
  operatorName: true, deviceId: true, address: true,
  categories: { select: { category: { select: { name: true } } }, orderBy: [{ category: { sortOrder: 'asc' } }, { categoryId: 'asc' }] },
  tenant: { select: { id: true, name: true } }, region: { select: { id: true, name: true } },
  fieldFindings: { where: { status: 'PENDING_REVIEW' }, select: { status: true }, take: 1 },
} satisfies Prisma.ReportSelect;
const detailSelect = {
  ...summarySelect, latitude: true, longitude: true, finalReportText: true, userDescription: true, contactPhoneMasked: true,
  images: { select: { id: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  statusHistory: {
    select: { id: true, newStatus: true, createdAt: true, completionMethod: true, publicNote: true, internalNote: true, admin: { select: { name: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  fieldFindings: {
    select: { id: true, type: true, note: true, status: true, createdAt: true, reviewedAt: true,
      collector: { select: { name: true } }, reviewer: { select: { name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  },
} satisfies Prisma.ReportSelect;
const collectionDetailSelect = {
  ...summarySelect, latitude: true, longitude: true, finalReportText: true, userDescription: true,
  images: { select: { id: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  statusHistory: { select: { id: true, newStatus: true, createdAt: true, completionMethod: true, publicNote: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  fieldFindings: { select: { id: true, type: true, note: true, status: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
} satisfies Prisma.ReportSelect;
type SummaryRow = Prisma.ReportGetPayload<{ select: typeof summarySelect }>;
const relatedSelect = { ...summarySelect, id: true, tenantId: true, regionId: true, latitude: true, longitude: true } satisfies Prisma.ReportSelect;
type RelatedRow = Prisma.ReportGetPayload<{ select: typeof relatedSelect }>;
function relatedFacts(row: RelatedRow): RelatedFacts {
  return { ...row, latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber() };
}
async function completionBoundaries(transaction: Prisma.TransactionClient, anchor: RelatedRow): Promise<Date[] | null> {
  const completed = await transaction.report.findMany({
    where: { tenantId: anchor.tenantId, regionId: anchor.regionId, status: 'COMPLETED',
      completedAt: { gte: new Date(anchor.createdAt.getTime() - RELATED_WINDOW_MS), lte: new Date(anchor.createdAt.getTime() + RELATED_WINDOW_MS) },
      operatorName: { not: null }, deviceId: { not: null } },
    select: { operatorName: true, deviceId: true, completedAt: true },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }], take: RELATED_SCAN_LIMIT + 1,
  });
  if (completed.length > RELATED_SCAN_LIMIT) return null;
  return completed.filter(row => sameIdentity(anchor, row)).map(row => row.completedAt!);
}
function summary(row: SummaryRow): AdminReportSummary {
  return {
    publicId: row.publicId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), status: row.status,
    completionMethod: row.completionMethod, completedAt: row.completedAt?.toISOString() ?? null,
    operatorName: normalizeOperatorName(row.operatorName), deviceId: row.deviceId, address: row.address,
    categories: row.categories.map(item => item.category.name), tenant: row.tenant, region: row.region,
    hasPendingFieldFinding: row.fieldFindings?.some(finding => finding.status === 'PENDING_REVIEW') ?? false,
  };
}
function detail(row: Prisma.ReportGetPayload<{ select: typeof detailSelect }>): AdminReportDetail {
  return {
    ...summary(row), latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber(),
    finalReportText: row.finalReportText, userDescription: row.userDescription, contactPhoneMasked: row.contactPhoneMasked,
    images: row.images.map(image => ({ id: image.id, url: `/api/admin/reports/${encodeURIComponent(row.publicId)}/images/${image.id}` })),
    history: row.statusHistory.map(event => ({
      id: event.id, status: event.newStatus, createdAt: event.createdAt.toISOString(), completionMethod: event.completionMethod,
      publicNote: event.publicNote, internalNote: event.internalNote, adminName: event.admin?.name ?? null,
    })),
    fieldFindings: (row.fieldFindings ?? []).map(finding => ({
      id: finding.id, type: finding.type, note: finding.note, status: finding.status,
      createdAt: finding.createdAt.toISOString(), collectorName: finding.collector.name,
      reviewedAt: finding.reviewedAt?.toISOString() ?? null, reviewerName: finding.reviewer?.name ?? null,
    })),
  };
}
function collectionDetail(row: Prisma.ReportGetPayload<{ select: typeof collectionDetailSelect }>): CollectorReportDetail {
  return {
    ...summary(row), latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber(),
    finalReportText: row.finalReportText, userDescription: row.userDescription,
    images: row.images.map(image => ({ id: image.id, url: `/api/admin/collection/reports/${encodeURIComponent(row.publicId)}/images/${image.id}` })),
    history: row.statusHistory.map(event => ({ id: event.id, status: event.newStatus,
      createdAt: event.createdAt.toISOString(), completionMethod: event.completionMethod, publicNote: event.publicNote })),
    fieldFindings: row.fieldFindings.map(finding => ({ id: finding.id, type: finding.type,
      note: finding.note, status: finding.status, createdAt: finding.createdAt.toISOString() })),
  };
}

export class PrismaAdminReportRepository implements AdminReportRepository {
  private readonly client: PrismaClient;
  private readonly ownsClient: boolean;
  constructor(databaseUrl: string, client?: PrismaClient) {
    this.client = client ?? new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
    this.ownsClient = !client;
  }

  async dashboard(scope: AdminReportScope): Promise<AdminDashboard> {
    const where = scoped(scope);
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dayStart = new Date(`${kstDate}T00:00:00+09:00`);
    const [total, today, received, processing, completed, rejected, recent] = await this.client.$transaction([
      this.client.report.count({ where }), this.client.report.count({ where: { ...where, createdAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) } } }),
      this.client.report.count({ where: { ...where, status: 'RECEIVED' } }),
      this.client.report.count({ where: { ...where, status: 'PROCESSING' } }),
      this.client.report.count({ where: { ...where, status: 'COMPLETED' } }),
      this.client.report.count({ where: { ...where, status: 'REJECTED' } }),
      this.client.report.findMany({ where, select: summarySelect, orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }], take: 10 }),
    ], { isolationLevel: 'RepeatableRead' });
    return { mode: 'database', summary: { total, today, received, processing, completed, rejected }, recentReports: recent.map(summary) };
  }

  async list(scope: AdminReportScope, query: AdminReportQuery): Promise<AdminReportPage> {
    const where = filtered(scope, query);
    const [total, rows] = await this.client.$transaction([
      this.client.report.count({ where }),
      this.client.report.findMany({ where, select: summarySelect, orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ], { isolationLevel: 'RepeatableRead' });
    return { mode: 'database', items: rows.map(summary), total, page: query.page, pageSize: query.pageSize };
  }

  async map(scope: AdminReportScope, input: AdminReportMapQuery): Promise<AdminReportMapPage> {
    // Keep the SQL LIMIT bounded even when this repository is called outside the HTTP controller.
    const query = adminReportMapQuery.parse(input);
    const where = filtered(scope, query);
    const [total, rows] = await this.client.$transaction([
      this.client.report.count({ where }),
      this.client.report.findMany({
        where, select: { ...summarySelect, latitude: true, longitude: true },
        orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize,
      }),
    ], { isolationLevel: 'RepeatableRead' });
    return { mode: 'database', items: rows.map(row => ({ ...summary(row), latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber() })), total, page: query.page, pageSize: query.pageSize };
  }

  async collectionMap(scope: AdminReportScope, input: AdminReportMapQuery): Promise<AdminReportMapPage> {
    if (scope.role !== 'COLLECTOR') throw new ApiError(403, 'FORBIDDEN', '수거 담당자 권한이 필요합니다.');
    const query = adminReportMapQuery.parse(input);
    const where: Prisma.ReportWhereInput = { ...scoped(scope), status: { in: ['RECEIVED', 'PROCESSING'] },
      fieldFindings: { none: { status: 'PENDING_REVIEW' } } };
    const [total, rows] = await this.client.$transaction([
      this.client.report.count({ where }),
      this.client.report.findMany({
        where, select: { ...summarySelect, latitude: true, longitude: true },
        orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize,
      }),
    ], { isolationLevel: 'RepeatableRead' });
    return { mode: 'database', items: rows.map(row => ({ ...summary(row), latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber() })), total, page: query.page, pageSize: query.pageSize };
  }

  async hotspots(scope: AdminReportScope, input: AdminReportHotspotQuery): Promise<AdminReportHotspots> {
    const query = adminReportHotspotQuery.parse(input);
    const rows = await this.client.report.findMany({
      where: filtered(scope, query), select: { latitude: true, longitude: true },
    });
    return { mode: 'database', ...reportHotspots(rows.map(row => ({ latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber() }))) };
  }

  async nearby(scope: AdminReportScope, input: AdminNearbyReportQuery): Promise<AdminNearbyReportPage> {
    const query = adminNearbyReportQuery.parse(input);
    const where: Prisma.ReportWhereInput = { ...scoped(scope), status: { in: ['RECEIVED', 'PROCESSING'] },
      ...(scope.role === 'COLLECTOR' ? { fieldFindings: { none: { status: 'PENDING_REVIEW' as const } } } : {}) };
    const tenantFilter = scope.tenantId ? Prisma.sql`AND tenant_id = ${scope.tenantId}::uuid` : Prisma.empty;
    const pendingFilter = scope.role === 'COLLECTOR' ? Prisma.sql`AND NOT EXISTS (
      SELECT 1 FROM report_field_findings finding WHERE finding.report_id = reports.id AND finding.status = 'PENDING_REVIEW'
    )` : Prisma.empty;
    const { latitude, longitude, page, pageSize } = query;
    const offset = (page - 1) * pageSize;
    return this.client.$transaction(async transaction => {
      const total = await transaction.report.count({ where });
      const nearest = await transaction.$queryRaw<{ id: string; distanceMeters: number }[]>`
        SELECT id,
          12742000.0 * asin(sqrt(LEAST(1.0, GREATEST(0.0,
            power(sin(radians((latitude::double precision - ${latitude}::double precision) / 2.0)), 2)
            + cos(radians(${latitude}::double precision)) * cos(radians(latitude::double precision))
              * power(sin(radians((longitude::double precision - ${longitude}::double precision) / 2.0)), 2)
          )))) AS "distanceMeters"
        FROM reports
        WHERE status IN ('RECEIVED', 'PROCESSING') ${tenantFilter} ${pendingFilter}
        ORDER BY "distanceMeters" ASC, created_at DESC, public_id ASC
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      const rows = nearest.length ? await transaction.report.findMany({
        where: { id: { in: nearest.map(row => row.id) } },
        select: { ...summarySelect, id: true, latitude: true, longitude: true },
      }) : [];
      const byId = new Map(rows.map(row => [row.id, row]));
      const items = nearest.map(({ id, distanceMeters }) => {
        const row = byId.get(id);
        if (!row) throw new Error('Nearby report snapshot changed');
        return { ...summary(row), latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber(), distanceMeters: Math.round(distanceMeters) };
      });
      return { mode: 'database', items, total, page, pageSize };
    }, { isolationLevel: 'RepeatableRead', timeout: 10_000 });
  }

  async detail(scope: AdminReportScope, publicId: string): Promise<AdminReportDetail> {
    const where = scoped(scope);
    if (!publicIdValid(publicId)) throw missing();
    const row = await this.client.report.findFirst({ where: { ...where, publicId }, select: detailSelect });
    if (!row) throw missing();
    return detail(row);
  }

  async collectionDetail(scope: AdminReportScope, publicId: string): Promise<CollectorReportDetail> {
    if (scope.role !== 'COLLECTOR') throw new ApiError(403, 'FORBIDDEN', '수거 담당자 권한이 필요합니다.');
    const where = scoped(scope);
    if (!publicIdValid(publicId)) throw missing();
    const row = await this.client.report.findFirst({
      where: { ...where, publicId, status: { in: ['RECEIVED', 'PROCESSING'] } }, select: collectionDetailSelect,
    });
    if (!row) throw missing();
    return collectionDetail(row);
  }

  async related(scope: AdminReportScope, publicId: string): Promise<AdminRelatedReports> {
    const where = scoped(scope);
    if (!publicIdValid(publicId)) throw missing();
    return this.client.$transaction(async transaction => {
      const anchor = await transaction.report.findFirst({ where: { ...where, publicId }, select: relatedSelect });
      if (!anchor) throw missing();
      const unavailable = (reason: Exclude<AdminRelatedReports['reason'], null>): AdminRelatedReports => ({
        anchorPublicId: publicId, eligible: false, reason, criteria: RELATED_CRITERIA, items: [], truncated: reason === 'CANDIDATE_LIMIT',
      });
      if (anchor.status === 'COMPLETED') return unavailable('ANCHOR_COMPLETED');
      if (anchor.status === 'REJECTED') return unavailable('ANCHOR_REJECTED');
      if (!knownIdentity(anchor)) return unavailable('IDENTITY_UNKNOWN');
      const completions = await completionBoundaries(transaction, anchor);
      if (completions === null) return unavailable('CANDIDATE_LIMIT');
      const rows = await transaction.report.findMany({
        where: { tenantId: anchor.tenantId, regionId: anchor.regionId, id: { not: anchor.id }, status: { in: ['RECEIVED', 'PROCESSING'] },
          createdAt: { gte: new Date(anchor.createdAt.getTime() - RELATED_WINDOW_MS), lte: new Date(anchor.createdAt.getTime() + RELATED_WINDOW_MS) },
          operatorName: { not: null }, deviceId: { not: null } },
        select: relatedSelect, orderBy: [{ createdAt: 'asc' }, { publicId: 'asc' }], take: RELATED_SCAN_LIMIT + 1,
      });
      if (rows.length > RELATED_SCAN_LIMIT) return unavailable('CANDIDATE_LIMIT');
      const anchorFacts = relatedFacts(anchor);
      const matches = rows.filter(row => belongsToIncident(anchorFacts, relatedFacts(row), completions));
      return { anchorPublicId: publicId, eligible: true, reason: null, criteria: RELATED_CRITERIA,
        items: matches.slice(0, RELATED_CRITERIA.maxSelection - 1).map(row => ({
          ...summary(row), distanceMeters: Math.round(distanceMeters(anchorFacts, relatedFacts(row))),
        })), truncated: matches.length >= RELATED_CRITERIA.maxSelection };
    }, { isolationLevel: 'RepeatableRead', timeout: 10_000 });
  }

  async transitionRelated(scope: AdminReportScope, publicId: string, payload: AdminRelatedReportTransition): Promise<AdminRelatedReportResult> {
    const where = scoped(scope);
    if (!publicIdValid(publicId)) throw missing();
    const input = adminRelatedReportTransition.parse(payload);
    if (!input.reports.some(report => report.publicId === publicId)) {
      throw new ApiError(400, 'INVALID_INPUT', '기준 신고를 선택한 신고 목록에 포함해주세요.');
    }
    const selection = [...input.reports].sort((left, right) => left.publicId.localeCompare(right.publicId));
    const selectedIds = selection.map(report => report.publicId);
    const publicNote = input.publicNote || null; const internalNote = input.internalNote || null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(async transaction => {
          const rows = await transaction.report.findMany({ where: { ...where, publicId: { in: selectedIds } },
            select: { ...relatedSelect, completedByAdminId: true, statusHistory: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1,
              select: { id: true, adminId: true, newStatus: true, completionMethod: true, publicNote: true, internalNote: true } } },
            orderBy: { publicId: 'asc' } });
          if (rows.length !== selection.length) throw missing();
          const anchor = rows.find(row => row.publicId === publicId)!;
          if (!knownIdentity(anchor)) throw conflict();
          if (rows.some(row => !belongsToIncident(relatedFacts(anchor), relatedFacts(row), []))) throw conflict();
          const replay = rows.every((row, index) => {
            const last = row.statusHistory[0];
            return row.status === 'COMPLETED' && row.completionMethod === input.completionMethod && row.completedByAdminId === scope.adminId
              && new Date(selection[index]!.expectedUpdatedAt).getTime() < row.updatedAt.getTime()
              && last?.id === relatedHistoryId(publicId, scope.adminId, input, row.publicId)
              && last.adminId === scope.adminId && last.newStatus === 'COMPLETED' && last.completionMethod === input.completionMethod
              && last.publicNote === publicNote && last.internalNote === internalNote;
          });
          // The exact deterministic history proves this scoped batch was already
          // validated and committed. Its own completions may push a subsequent
          // bounded scan over the limit; a retry must not depend on that scan.
          if (replay) return { anchorPublicId: publicId, items: rows.map(summary), replayed: true };
          if (rows.some((row, index) => row.status === 'COMPLETED' || row.status === 'REJECTED'
            || row.updatedAt.getTime() !== new Date(selection[index]!.expectedUpdatedAt).getTime())) throw conflict();
          const completions = await completionBoundaries(transaction, anchor);
          if (completions === null || rows.some(row => !belongsToIncident(relatedFacts(anchor), relatedFacts(row), completions))) throw conflict();
          const now = new Date(Math.max(Date.now(), ...rows.map(row => row.updatedAt.getTime() + 1)));
          for (const row of rows) {
            const changed = await transaction.report.updateMany({
              where: { ...where, id: row.id, tenantId: anchor.tenantId, regionId: anchor.regionId, updatedAt: row.updatedAt, status: row.status },
              data: { status: 'COMPLETED', completionMethod: input.completionMethod, completedAt: now, completedByAdminId: scope.adminId, updatedAt: now },
            });
            if (changed.count !== 1) throw conflict();
            await transaction.reportStatusHistory.create({ data: {
              id: relatedHistoryId(publicId, scope.adminId, input, row.publicId), reportId: row.id, previousStatus: row.status,
              newStatus: 'COMPLETED', completionMethod: input.completionMethod, adminId: scope.adminId,
              publicNote, internalNote, createdAt: now,
            }, select: { id: true } });
            await transaction.reportFieldFinding.updateMany({
              where: { reportId: row.id, status: 'PENDING_REVIEW' },
              data: { status: 'REVIEWED', reviewedAt: now, reviewedByAdminId: scope.adminId },
            });
          }
          const updated = await transaction.report.findMany({ where: { ...where, publicId: { in: selectedIds } }, select: summarySelect, orderBy: { publicId: 'asc' } });
          return { anchorPublicId: publicId, items: updated.map(summary), replayed: false };
        }, { isolationLevel: 'Serializable', timeout: 15_000 });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') {
          if (attempt < 2) continue;
          throw conflict();
        }
        throw error;
      }
    }
    throw conflict();
  }

  async image(scope: AdminReportScope, publicId: string, imageId: string): Promise<{ objectKey: string }> {
    const where = scoped(scope);
    if (!publicIdValid(publicId) || !UUID.test(imageId)) throw missing();
    const image = await this.client.reportImage.findFirst({
      where: { id: imageId, report: { ...where, publicId } }, select: { objectKey: true },
    });
    if (!image) throw missing();
    return image;
  }

  async collectionImage(scope: AdminReportScope, publicId: string, imageId: string): Promise<{ objectKey: string }> {
    if (scope.role !== 'COLLECTOR') throw new ApiError(403, 'FORBIDDEN', '수거 담당자 권한이 필요합니다.');
    const where = scoped(scope);
    if (!publicIdValid(publicId) || !UUID.test(imageId)) throw missing();
    const image = await this.client.reportImage.findFirst({
      where: { id: imageId, report: { ...where, publicId, status: { in: ['RECEIVED', 'PROCESSING'] } } },
      select: { objectKey: true },
    });
    if (!image) throw missing();
    return image;
  }

  async collectionComplete(scope: AdminReportScope, publicId: string, input: CollectorCompletion): Promise<CollectorReportDetail> {
    if (scope.role !== 'COLLECTOR') throw new ApiError(403, 'FORBIDDEN', '수거 담당자 권한이 필요합니다.');
    const where = scoped(scope);
    if (!publicIdValid(publicId)) throw missing();
    const expected = new Date(input.expectedUpdatedAt);
    const publicNote = '현장 수거를 완료했습니다.';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(async transaction => {
          const current = await transaction.report.findFirst({ where: { ...where, publicId }, select: {
            id: true, status: true, updatedAt: true, completedByAdminId: true, completionMethod: true,
            fieldFindings: { where: { status: 'PENDING_REVIEW' }, select: { id: true }, take: 1 },
            statusHistory: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1,
              select: { adminId: true, newStatus: true, completionMethod: true, publicNote: true } },
          } });
          if (!current) throw missing();
          const last = current.statusHistory[0];
          const replay = expected.getTime() < current.updatedAt.getTime()
            && current.status === 'COMPLETED' && current.completedByAdminId === scope.adminId
            && current.completionMethod === 'COLLECTED' && last?.adminId === scope.adminId
            && last.newStatus === 'COMPLETED' && last.completionMethod === 'COLLECTED' && last.publicNote === publicNote;
          if (!replay) {
            if (current.status === 'COMPLETED' || current.status === 'REJECTED'
              || current.updatedAt.getTime() !== expected.getTime()) throw conflict();
            if (current.fieldFindings.length) throw new ApiError(409, 'FIELD_FINDING_PENDING', '현장 미발견 기록이 관리자 검토 중입니다.');
            const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
            const changed = await transaction.report.updateMany({
              where: { ...where, id: current.id, updatedAt: expected, status: current.status,
                fieldFindings: { none: { status: 'PENDING_REVIEW' } } },
              data: { status: 'COMPLETED', completionMethod: 'COLLECTED', completedAt: now,
                completedByAdminId: scope.adminId, updatedAt: now },
            });
            if (changed.count !== 1) throw conflict();
            await transaction.reportStatusHistory.create({ data: {
              reportId: current.id, previousStatus: current.status, newStatus: 'COMPLETED', completionMethod: 'COLLECTED',
              adminId: scope.adminId, publicNote, createdAt: now,
            }, select: { id: true } });
          }
          const row = await transaction.report.findFirst({ where: { ...where, id: current.id }, select: collectionDetailSelect });
          if (!row) throw missing();
          return collectionDetail(row);
        }, { isolationLevel: 'Serializable', timeout: 10_000 });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') {
          if (attempt < 2) continue;
          throw conflict();
        }
        throw error;
      }
    }
    throw conflict();
  }

  async collectionMissing(scope: AdminReportScope, publicId: string, input: CollectorMissing): Promise<CollectorReportDetail> {
    if (scope.role !== 'COLLECTOR') throw new ApiError(403, 'FORBIDDEN', '수거 담당자 권한이 필요합니다.');
    const where = scoped(scope);
    if (!publicIdValid(publicId)) throw missing();
    const expected = new Date(input.expectedUpdatedAt);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(async transaction => {
          const current = await transaction.report.findFirst({ where: { ...where, publicId }, select: {
            id: true, status: true, updatedAt: true,
            fieldFindings: { where: { status: 'PENDING_REVIEW' }, select: { id: true }, take: 1 },
          } });
          if (!current) throw missing();
          if (current.status === 'COMPLETED' || current.status === 'REJECTED'
            || current.updatedAt.getTime() !== expected.getTime()) throw conflict();
          if (current.fieldFindings.length) throw new ApiError(409, 'FIELD_FINDING_PENDING', '현장 미발견 기록이 관리자 검토 중입니다.');
          const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
          const changed = await transaction.report.updateMany({
            where: { ...where, id: current.id, updatedAt: expected, status: current.status,
              fieldFindings: { none: { status: 'PENDING_REVIEW' } } },
            data: { updatedAt: now },
          });
          if (changed.count !== 1) throw conflict();
          await transaction.reportFieldFinding.create({ data: {
            reportId: current.id, collectorId: scope.adminId, type: 'DEVICE_NOT_FOUND', note: input.note,
            status: 'PENDING_REVIEW', createdAt: now,
          }, select: { id: true } });
          const row = await transaction.report.findFirst({ where: { ...where, id: current.id }, select: collectionDetailSelect });
          if (!row) throw missing();
          return collectionDetail(row);
        }, { isolationLevel: 'Serializable', timeout: 10_000 });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && (error.code === 'P2034' || error.code === 'P2002')) {
          if (attempt < 2) continue;
          throw conflict();
        }
        throw error;
      }
    }
    throw conflict();
  }

  async transition(scope: AdminReportScope, publicId: string, input: AdminReportTransition): Promise<AdminReportDetail> {
    const where = scoped(scope);
    if (!publicIdValid(publicId)) throw missing();
    const expected = new Date(input.expectedUpdatedAt);
    const publicNote = input.publicNote || null;
    const internalNote = input.internalNote || null;
    const completionMethod = input.completionMethod ?? null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(async transaction => {
          const current = await transaction.report.findFirst({ where: { ...where, publicId }, select: {
            id: true, status: true, updatedAt: true, completionMethod: true,
            statusHistory: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1,
              select: { adminId: true, newStatus: true, completionMethod: true, publicNote: true, internalNote: true } },
          } });
          if (!current) throw missing();
          const last = current.statusHistory[0];
          const replay = expected.getTime() < current.updatedAt.getTime() && current.status === input.status
            && current.completionMethod === completionMethod && last?.adminId === scope.adminId
            && last.newStatus === input.status && last.completionMethod === completionMethod
            && last.publicNote === publicNote && last.internalNote === internalNote;
          if (!replay) {
            if (current.updatedAt.getTime() !== expected.getTime() || current.status === 'COMPLETED'
              || current.status === 'REJECTED'
              || (current.status === 'PROCESSING' && input.status === 'PROCESSING')) throw conflict();
            const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
            const changed = await transaction.report.updateMany({
              where: { ...where, id: current.id, updatedAt: expected, status: current.status },
              data: { status: input.status, updatedAt: now, completionMethod,
                completedAt: input.status === 'COMPLETED' ? now : null, completedByAdminId: input.status === 'COMPLETED' ? scope.adminId : null },
            });
            if (changed.count !== 1) throw conflict();
            await transaction.reportStatusHistory.create({ data: {
              reportId: current.id, previousStatus: current.status, newStatus: input.status, completionMethod,
              adminId: scope.adminId, publicNote, internalNote, createdAt: now,
            }, select: { id: true } });
            if (input.status === 'COMPLETED' || input.status === 'REJECTED') {
              await transaction.reportFieldFinding.updateMany({
                where: { reportId: current.id, status: 'PENDING_REVIEW' },
                data: { status: 'REVIEWED', reviewedAt: now, reviewedByAdminId: scope.adminId },
              });
            }
          }
          const row = await transaction.report.findFirst({ where: { ...where, id: current.id }, select: detailSelect });
          if (!row) throw missing();
          return detail(row);
        }, { isolationLevel: 'Serializable', timeout: 10_000 });
      } catch (error) {
        // A competing update can produce a serialization failure. Re-read it to distinguish a safe retry from a conflict.
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') {
          if (attempt < 2) continue;
          throw conflict();
        }
        throw error;
      }
    }
    throw conflict();
  }

  async close(): Promise<void> { if (this.ownsClient) await this.client.$disconnect(); }
}
