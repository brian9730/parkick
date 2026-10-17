import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { REPORT_LOOKUP_MAX_PAGE, REPORT_LOOKUP_PAGE_SIZE } from '../services/reports/reportLookupInput.js';
import type { PublicReportDetail, PublicReportSummary } from '../services/reports/reportLookupInput.js';

export interface ReportLookupIdentity { phoneIdentifier: string; phoneHmacKeyVersion: string }
export interface ReportLookupRepository {
  list(identity: ReportLookupIdentity, page: number): Promise<PublicReportSummary[]>;
  detail(identity: ReportLookupIdentity, publicId: string): Promise<PublicReportDetail | null>;
  close(): Promise<void>;
}
export class ReportLookupRepositoryError extends Error {
  constructor() { super('Report lookup unavailable'); }
}

// Sensitive columns are not fetched from PostgreSQL, even for an authorized match.
const summarySelect = {
  publicId: true, createdAt: true, operatorName: true, status: true,
  completionMethod: true, completedAt: true,
  categories: {
    select: { category: { select: { name: true } } },
    orderBy: [{ category: { sortOrder: 'asc' } }, { categoryId: 'asc' }],
  },
} satisfies Prisma.ReportSelect;
const detailSelect = {
  ...summarySelect,
  statusHistory: {
    select: { newStatus: true, createdAt: true, completionMethod: true, publicNote: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ReportSelect;
type SummaryRow = Prisma.ReportGetPayload<{ select: typeof summarySelect }>;

function summary(row: SummaryRow): PublicReportSummary {
  return {
    publicId: row.publicId, createdAt: row.createdAt.toISOString(), operatorName: row.operatorName,
    categories: row.categories.map(item => item.category.name), status: row.status,
    completionMethod: row.completionMethod, completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function matchingPhone(identity: ReportLookupIdentity) {
  // Do not let undefined/empty values remove the WHERE predicate through ORM omission.
  if (!/^[a-f0-9]{64}$/.test(identity.phoneIdentifier ?? '')
    || !/^[a-z0-9-]{1,80}$/.test(identity.phoneHmacKeyVersion ?? '')) throw new ReportLookupRepositoryError();
  return { phoneIdentifier: identity.phoneIdentifier, phoneHmacKeyVersion: identity.phoneHmacKeyVersion };
}

export class PrismaReportLookupRepository implements ReportLookupRepository {
  private readonly client: Pick<PrismaClient, 'report'>;
  private readonly ownedClient: PrismaClient | undefined;

  constructor(databaseUrl: string, client?: Pick<PrismaClient, 'report'>) {
    this.ownedClient = client ? undefined : new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
    this.client = client ?? this.ownedClient!;
  }

  async list(identity: ReportLookupIdentity, page: number): Promise<PublicReportSummary[]> {
    try {
      if (!Number.isInteger(page) || page < 1 || page > REPORT_LOOKUP_MAX_PAGE) throw new ReportLookupRepositoryError();
      const rows = await this.client.report.findMany({
        where: matchingPhone(identity), select: summarySelect,
        orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }],
        skip: (page - 1) * REPORT_LOOKUP_PAGE_SIZE, take: REPORT_LOOKUP_PAGE_SIZE + 1,
      });
      return rows.map(summary);
    } catch { throw new ReportLookupRepositoryError(); }
  }

  async detail(identity: ReportLookupIdentity, publicId: string): Promise<PublicReportDetail | null> {
    try {
      if (!/^PK-\d{8}-[a-f0-9]{12}$/.test(publicId)) return null;
      const row = await this.client.report.findFirst({
        where: { ...matchingPhone(identity), publicId }, select: detailSelect,
      });
      if (!row) return null;
      return {
        ...summary(row),
        history: row.statusHistory.map(event => ({
          status: event.newStatus, createdAt: event.createdAt.toISOString(),
          completionMethod: event.completionMethod, publicNote: event.publicNote,
        })),
      };
    } catch { throw new ReportLookupRepositoryError(); }
  }

  async close(): Promise<void> { await this.ownedClient?.$disconnect(); }
}
