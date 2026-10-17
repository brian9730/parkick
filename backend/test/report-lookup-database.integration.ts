import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { assertTaskLocalDatabase, localTestDatabaseUrl } from '../scripts/local-database.js';
import { seedLocalDevelopment } from '../prisma/seed.js';
import { PrismaReportLookupRepository } from '../src/repositories/ReportLookupRepository.js';
import { ReportLookupService } from '../src/services/reports/ReportLookupService.js';
import { protectContact } from '../src/services/reports/phone.js';
import { ApiError } from '../src/middleware/errors.js';

// Never load the user's .env or target production; fixture transactions always roll back.
const databaseUrl = process.env.TEST_DATABASE_URL || localTestDatabaseUrl;
assertTaskLocalDatabase(databaseUrl, true);
assert.equal(new URL(databaseUrl).pathname, '/parkick_test');
const client = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
const lookupKey = randomBytes(32);
const encryptionKey = randomBytes(32);
const phone = '01011112222';
const otherPhone = '01033334444';
const date = new Date('2026-10-15T01:00:00.000Z');
const rollbackMarker = new Error('intentional lookup test rollback');
let tenantId: string;
let regionId: string;
let categoryId: string;

async function rollback(work: (transaction: Prisma.TransactionClient, service: ReportLookupService) => Promise<void>) {
  try {
    await client.$transaction(async transaction => {
      const repository = new PrismaReportLookupRepository(databaseUrl, transaction);
      await work(transaction, new ReportLookupService(lookupKey, repository));
      // Injected transaction clients are not disconnected by the repository.
      await repository.close();
      throw rollbackMarker;
    }, { timeout: 20_000 });
  } catch (error) { if (error !== rollbackMarker) throw error; }
}

function reportData(contact: string | null, changes: Partial<Prisma.ReportUncheckedCreateInput> = {}): Prisma.ReportUncheckedCreateInput {
  return {
    publicId: `PK-20261015-${randomBytes(6).toString('hex')}`, submissionId: randomUUID(),
    submissionHash: randomBytes(32).toString('hex'), tenantId, regionId,
    latitude: 37.123456, longitude: 127.123456, address: 'PRIVATE_LOCATION_SENTINEL',
    finalReportText: 'PRIVATE_REPORT_TEXT_SENTINEL', operatorName: '조회 통합 테스트 업체',
    userDescription: 'PRIVATE_DESCRIPTION_SENTINEL', qrRawData: 'PRIVATE_QR_SENTINEL',
    createdAt: date, ...protectContact(contact, encryptionKey, lookupKey, date),
    categories: { create: { categoryId } },
    statusHistory: { create: { newStatus: 'RECEIVED', createdAt: date } },
    ...changes,
  };
}

describe('Phase 5 PostgreSQL public lookup (dedicated test DB, rolled-back fixtures)', () => {
  before(async () => {
    await client.$connect();
    await seedLocalDevelopment(client);
    const region = await client.region.findUniqueOrThrow({ where: { code: 'local-development' } });
    regionId = region.id;
    tenantId = region.tenantId;
    categoryId = (await client.reportCategory.findUniqueOrThrow({ where: { code: 'OTHER' } })).id;
  });
  after(async () => { await client.$disconnect(); });

  it('matches existing encrypted submissions by HMAC+version and excludes other, absent and old-version numbers', async () => {
    await rollback(async (transaction, service) => {
      const own = await transaction.report.create({ data: reportData(phone) });
      const other = await transaction.report.create({ data: reportData(otherPhone) });
      const anonymous = await transaction.report.create({ data: reportData(null) });
      await transaction.report.create({ data: reportData(phone, { phoneHmacKeyVersion: 'old-v0' }) });
      const list = await service.list({ phone: '010-1111-2222' });
      assert.deepEqual(list.items.map(row => row.publicId), [own.publicId]);
      assert.deepEqual((await service.list({ phone: otherPhone })).items.map(row => row.publicId), [other.publicId]);
      assert.deepEqual((await service.list({ phone: '01099998888' })).items, []);
      assert.equal((await service.detail(own.publicId, { phone })).publicId, own.publicId);
      for (const publicId of [other.publicId, anonymous.publicId, `PK-20261015-${randomBytes(6).toString('hex')}`]) {
        await assert.rejects(service.detail(publicId, { phone }), error => error instanceof ApiError && error.status === 404 && error.code === 'REPORT_NOT_FOUND');
      }
      const serialized = JSON.stringify(list);
      for (const secret of [phone, own.phoneIdentifier!, 'PRIVATE_', 'contactPhone', 'latitude', 'tenantId']) assert.equal(serialized.includes(secret), false);
    });
  });

  it('paginates real SQL matches by creation date and public ID with a bounded look-ahead', async () => {
    await rollback(async (transaction, service) => {
      const prefix = randomBytes(4).toString('hex');
      const identifiers = Array.from({ length: 23 }, (_, index) => `PK-20261015-${prefix}${index.toString(16).padStart(4, '0')}`);
      for (const publicId of identifiers) await transaction.report.create({ data: reportData(phone, { publicId }) });
      const first = await service.list({ phone });
      const second = await service.list({ phone, page: 2 });
      assert.deepEqual(first.items.map(row => row.publicId), [...identifiers].reverse().slice(0, 20));
      assert.equal(first.hasMore, true);
      assert.deepEqual(second.items.map(row => row.publicId), [...identifiers].reverse().slice(20));
      assert.equal(second.hasMore, false);
      assert.equal(new Set([...first.items, ...second.items].map(row => row.publicId)).size, 23);
      await transaction.report.update({ where: { publicId: identifiers[0]! }, data: { createdAt: new Date(date.getTime() + 1000) } });
      assert.equal((await service.list({ phone })).items[0]?.publicId, identifiers[0]);
      assert.deepEqual((await service.list({ phone, page: 1000 })).items, []);
    });
  });

  it('returns public completion history in chronological order without admin, evidence, internal or contact fields', async () => {
    await rollback(async (transaction, service) => {
      const admin = await transaction.admin.create({ data: {
        email: `${randomUUID()}@test.invalid`, name: '통합 테스트 관리자', passwordHash: 'not-a-login-hash', role: 'PLATFORM_ADMIN',
      } });
      const completedAt = new Date(date.getTime() + 2000);
      const report = await transaction.report.create({ data: reportData(phone, {
        status: 'COMPLETED', completionMethod: 'COLLECTED', completedAt, completedByAdminId: admin.id,
        images: { create: { objectKey: `private-test/${randomUUID()}.jpg`, mimeType: 'image/jpeg', sizeBytes: 100, exifRemoved: true } },
      }) });
      await transaction.reportStatusHistory.create({ data: {
        reportId: report.id, previousStatus: 'RECEIVED', newStatus: 'PROCESSING', adminId: admin.id,
        createdAt: new Date(date.getTime() + 1000), internalNote: 'PRIVATE_PROCESSING_NOTE', publicNote: '현장 확인 중',
      } });
      await transaction.reportStatusHistory.create({ data: {
        reportId: report.id, previousStatus: 'PROCESSING', newStatus: 'COMPLETED', completionMethod: 'COLLECTED', adminId: admin.id,
        createdAt: completedAt, internalNote: 'PRIVATE_COMPLETION_NOTE', publicNote: '수거를 완료했습니다.',
      } });
      const response = await service.detail(report.publicId, { phone });
      assert.equal(response.completionMethod, 'COLLECTED');
      assert.equal(response.completedAt, completedAt.toISOString());
      assert.deepEqual(response.categories, ['기타']);
      assert.deepEqual(response.history.map(event => event.status), ['RECEIVED', 'PROCESSING', 'COMPLETED']);
      assert.equal(response.history[2]?.publicNote, '수거를 완료했습니다.');
      assert.equal(response.history[2]?.completionMethod, 'COLLECTED');
      const serialized = JSON.stringify(response);
      for (const secret of ['PRIVATE_', 'private-test', phone, admin.id, report.id, report.phoneIdentifier!, 'internalNote', 'images', 'address', 'latitude']) {
        assert.equal(serialized.includes(secret), false);
      }
      assert.deepEqual(Object.keys(response).sort(), ['categories', 'completedAt', 'completionMethod', 'createdAt', 'history', 'operatorName', 'publicId', 'status']);
    });
  });
});
