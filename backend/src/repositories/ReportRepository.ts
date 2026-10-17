import { PrismaClient } from '../generated/prisma/client.js';
import type { ReportFacts, ReportReceipt } from '../services/reports/reportInput.js';
import type { StoredContact } from '../services/reports/phone.js';
import type { StoredEvidence } from '../services/storage/EvidenceStorage.js';

export interface StoredReport { id: string; submissionHash: string; receipt: ReportReceipt }
export interface NewReport {
  id: string; publicId: string; submissionHash: string; createdAt: Date; regionCode: string;
  facts: ReportFacts; contact: StoredContact; images: readonly StoredEvidence[];
}
export interface ReportRepository {
  isAvailable(regionCode: string): Promise<boolean>;
  findBySubmissionId(id: string): Promise<StoredReport | null>;
  create(report: NewReport): Promise<StoredReport>;
  close(): Promise<void>;
}
export class ReportRepositoryError extends Error {
  constructor(readonly kind: 'conflict' | 'unavailable' | 'uncertain') { super(kind); }
}

const receiptFields = {
  id: true, submissionHash: true, publicId: true, createdAt: true, address: true,
  latitude: true, longitude: true, phoneIdentifier: true,
} as const;

type ReceiptRow = {
  id: string; submissionHash: string; publicId: string; createdAt: Date; address: string | null;
  latitude: { toNumber(): number }; longitude: { toNumber(): number }; phoneIdentifier: string | null;
};
function storedReport(row: ReceiptRow): StoredReport {
  return {
    id: row.id, submissionHash: row.submissionHash,
    receipt: {
      publicId: row.publicId, status: 'RECEIVED', createdAt: row.createdAt.toISOString(), address: row.address,
      latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber(), hasContact: row.phoneIdentifier !== null,
    },
  };
}

export class PrismaReportRepository implements ReportRepository {
  private readonly client: PrismaClient;
  constructor(databaseUrl: string) {
    this.client = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
  }

  async isAvailable(regionCode: string): Promise<boolean> {
    try {
      const region = await this.client.region.findUnique({ where: { code: regionCode }, select: { active: true, tenant: { select: { active: true } } } });
      return !!region?.active && region.tenant.active;
    } catch { return false; }
  }

  async findBySubmissionId(id: string): Promise<StoredReport | null> {
    try {
      const row = await this.client.report.findUnique({ where: { submissionId: id }, select: receiptFields });
      return row ? storedReport(row) : null;
    } catch { throw new ReportRepositoryError('unavailable'); }
  }

  async create(report: NewReport): Promise<StoredReport> {
    try {
      const row = await this.client.$transaction(async transaction => {
        const region = await transaction.region.findUnique({ where: { code: report.regionCode }, include: { tenant: true } });
        if (!region?.active || !region.tenant.active) throw new ReportRepositoryError('unavailable');
        const categories = await transaction.reportCategory.findMany({ where: { name: { in: report.facts.categories }, active: true }, select: { id: true } });
        if (categories.length !== report.facts.categories.length) throw new ReportRepositoryError('unavailable');
        return transaction.report.create({
          data: {
            id: report.id, publicId: report.publicId, submissionId: report.facts.submissionId, submissionHash: report.submissionHash,
            tenantId: region.tenantId, regionId: region.id,
            operatorName: report.facts.operator, deviceId: report.facts.deviceId, qrRawData: report.facts.qrRawData,
            latitude: report.facts.latitude, longitude: report.facts.longitude, address: report.facts.address,
            userDescription: report.facts.additionalDescription, finalReportText: report.facts.finalReportText,
            ...report.contact, status: 'RECEIVED', createdAt: report.createdAt,
            images: { create: report.images.map(image => ({ ...image })) },
            categories: { create: categories.map(category => ({ categoryId: category.id })) },
            statusHistory: { create: { previousStatus: null, newStatus: 'RECEIVED', createdAt: report.createdAt } },
          },
          select: receiptFields,
        });
      }, { maxWait: 5000, timeout: 15000 });
      return storedReport(row);
    } catch (error) {
      if (error instanceof ReportRepositoryError) throw error;
      const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
      if (code === 'P2002') throw new ReportRepositoryError('conflict');
      // These failures cannot have committed this insert. Lost-connection outcomes are reconciled by the service.
      if (['P1000', 'P1001', 'P1002', 'P1003', 'P1010', 'P2003', 'P2004', 'P2028', 'P2034'].includes(String(code))) {
        throw new ReportRepositoryError('unavailable');
      }
      throw new ReportRepositoryError('uncertain');
    }
  }

  async close(): Promise<void> { await this.client.$disconnect(); }
}
