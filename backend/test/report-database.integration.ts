import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { localCategories, seedLocalDevelopment } from '../prisma/seed.js';
import { assertTaskLocalDatabase, localTestDatabaseUrl } from '../scripts/local-database.js';
import { fillBlankEnvironment } from '../scripts/setup-local-env.js';

// Explicit dedicated test database only. DATABASE_URL from the user's .env is never used.
const databaseUrl = process.env.TEST_DATABASE_URL || localTestDatabaseUrl;
assertTaskLocalDatabase(databaseUrl, true);
assert.equal(new URL(databaseUrl).pathname, '/parkick_test', 'DB integration tests must use the dedicated parkick_test database.');
const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
let tenantId: string;
let regionId: string;
const rollbackMarker = new Error('intentional test rollback');

async function rollback(work: (transaction: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  try {
    await client.$transaction(async (transaction) => {
      await work(transaction);
      throw rollbackMarker;
    });
  } catch (error) {
    if (error !== rollbackMarker) throw error;
  }
}

function reportData(overrides: Partial<Prisma.ReportUncheckedCreateInput> = {}): Prisma.ReportUncheckedCreateInput {
  return {
    publicId: `PK-DBTEST-${randomUUID()}`,
    submissionId: randomUUID(), submissionHash: randomBytes(32).toString('hex'),
    tenantId, regionId, latitude: '37.123456', longitude: '127.123456',
    operatorName: 'DB 통합 테스트 업체', finalReportText: '보행로 통행 방해 신고 테스트',
    ...overrides,
  };
}

function constraint(name: string) {
  return (error: unknown) => error instanceof Error && error.message.includes(name);
}

describe('Phase 4 PostgreSQL integrity (dedicated test DB, no data reset)', () => {
  before(async () => {
    await client.$connect();
    await seedLocalDevelopment(client);
    const region = await client.region.findUniqueOrThrow({ where: { code: 'local-development' } });
    regionId = region.id;
    tenantId = region.tenantId;
  });
  after(async () => { await client.$disconnect(); });

  it('replays the seed idempotently and stores the exact ten Korean labels', async () => {
    const codes = localCategories.map(([code]) => code);
    const beforeSeed = await client.reportCategory.findMany({ where: { code: { in: codes } }, orderBy: { sortOrder: 'asc' } });
    await seedLocalDevelopment(client);
    const afterSeed = await client.reportCategory.findMany({ where: { code: { in: codes } }, orderBy: { sortOrder: 'asc' } });
    assert.equal(afterSeed.length, 10);
    assert.deepEqual(afterSeed.map(({ id }) => id), beforeSeed.map(({ id }) => id));
    assert.deepEqual(afterSeed.map(({ name }) => name), localCategories.map(([, name]) => name));
    assert.equal(await client.tenant.count({ where: { code: 'local-development' } }), 1);
    assert.equal(await client.region.count({ where: { code: 'local-development' } }), 1);
  });

  it('stores a no-contact report with all phone fields null and initial history in one transaction', async () => {
    await rollback(async (transaction) => {
      const report = await transaction.report.create({ data: {
        ...reportData(), statusHistory: { create: { newStatus: 'RECEIVED' } },
      }, include: { statusHistory: true } });
      assert.equal(report.status, 'RECEIVED');
      assert.equal(report.contactPhoneCipher, null);
      assert.equal(report.phoneEncryptionKeyVersion, null);
      assert.equal(report.phoneIdentifier, null);
      assert.equal(report.phoneHmacKeyVersion, null);
      assert.equal(report.contactPhoneMasked, null);
      assert.equal(report.consentVersion, null);
      assert.equal(report.consentedAt, null);
      assert.equal(report.statusHistory.length, 1);
      assert.equal(report.statusHistory[0]?.adminId, null);
    });
  });

  it('accepts all contact fields together and rejects partially populated contact fields', async () => {
    await rollback(async (transaction) => {
      const report = await transaction.report.create({ data: reportData({
        contactPhoneCipher: randomBytes(40), phoneEncryptionKeyVersion: 'test-v1',
        phoneIdentifier: randomBytes(32).toString('hex'), phoneHmacKeyVersion: 'test-v1',
        contactPhoneMasked: '010-****-0000', consentVersion: 'test-contact-v1', consentedAt: new Date(),
      }) });
      assert.ok(report.contactPhoneCipher);
      assert.equal(report.contactPhoneMasked, '010-****-0000');
    });
    await assert.rejects(client.$transaction(async (transaction) => {
      await transaction.report.create({ data: reportData({ contactPhoneMasked: '010-****-0000' }) });
    }), constraint('reports_phone_completeness_check'));
  });

  it('rejects a report whose region belongs to a different tenant', async () => {
    await assert.rejects(client.$transaction(async (transaction) => {
      const other = await transaction.tenant.create({ data: { code: `test-${randomUUID()}`, name: '격리 검증용 기관' } });
      await transaction.report.create({ data: reportData({ tenantId: other.id }) });
    }), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'P2003');
  });

  it('enforces explicit administrator scope and completion fields', async () => {
    await assert.rejects(client.$transaction(async (transaction) => {
      await transaction.admin.create({ data: { email: `${randomUUID()}@test.invalid`, name: '테스트 관리자', passwordHash: 'non-login-test-hash', role: 'TENANT_ADMIN' } });
    }), constraint('admins_role_tenant_check'));
    await assert.rejects(client.$transaction(async (transaction) => {
      await transaction.report.create({ data: reportData({ status: 'COMPLETED' }) });
    }), constraint('reports_completion_check'));
    await assert.rejects(client.$transaction(async (transaction) => {
      await transaction.report.create({ data: reportData({ completedAt: new Date() }) });
    }), constraint('reports_completion_check'));
    await rollback(async (transaction) => {
      const admin = await transaction.admin.create({ data: { email: `${randomUUID()}@test.invalid`, name: '테스트 관리자', passwordHash: 'non-login-test-hash', role: 'TENANT_ADMIN', tenantId } });
      const report = await transaction.report.create({ data: reportData({ status: 'COMPLETED', completedAt: new Date(), completionMethod: 'COLLECTED', completedByAdminId: admin.id }) });
      await transaction.reportStatusHistory.create({ data: { reportId: report.id, previousStatus: 'PROCESSING', newStatus: 'COMPLETED', completionMethod: 'COLLECTED', adminId: admin.id } });
      assert.equal(report.completedByAdminId, admin.id);
    });
  });

  it('requires an administrator for status transitions and rolls back a failed history write', async () => {
    const candidate = reportData();
    await assert.rejects(client.$transaction(async (transaction) => {
      const report = await transaction.report.create({ data: candidate });
      await transaction.reportStatusHistory.create({ data: { reportId: report.id, previousStatus: 'RECEIVED', newStatus: 'PROCESSING' } });
    }), constraint('report_status_history_actor_check'));
    assert.equal(await client.report.count({ where: { submissionId: candidate.submissionId } }), 0);
  });

  it('rejects invalid completion-history combinations and duplicate submissions', async () => {
    await assert.rejects(client.$transaction(async (transaction) => {
      const admin = await transaction.admin.create({ data: { email: `${randomUUID()}@test.invalid`, name: '테스트 관리자', passwordHash: 'non-login-test-hash', role: 'PLATFORM_ADMIN' } });
      const report = await transaction.report.create({ data: reportData() });
      await transaction.reportStatusHistory.create({ data: { reportId: report.id, previousStatus: 'PROCESSING', newStatus: 'COMPLETED', adminId: admin.id } });
    }), constraint('report_status_history_completion_check'));
    await assert.rejects(client.$transaction(async (transaction) => {
      const data = reportData();
      await transaction.report.create({ data });
      await transaction.report.create({ data: { ...data, publicId: `PK-DBTEST-${randomUUID()}` } });
    }), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'P2002');
  });
});

it('fills only blank local env fields and preserves secrets, BOM, CRLF and comments byte-for-byte', () => {
  const secret = randomBytes(32).toString('base64');
  const original = `\uFEFF# preserved comment\r\nDATABASE_URL=\r\nPHONE_ENCRYPTION_KEY="${secret}" # existing secret\r\nPHONE_LOOKUP_HMAC_KEY='' # fill here\r\nOTHER_SECRET='unchanged value'\r\n`;
  const additions = { DATABASE_URL: localTestDatabaseUrl, PHONE_ENCRYPTION_KEY: 'must-not-replace', PHONE_LOOKUP_HMAC_KEY: randomBytes(32).toString('base64') };
  const result = fillBlankEnvironment(original, additions);
  const expected = original.replace('DATABASE_URL=\r\n', `DATABASE_URL="${localTestDatabaseUrl}"\r\n`).replace("PHONE_LOOKUP_HMAC_KEY='' # fill here", `PHONE_LOOKUP_HMAC_KEY="${additions.PHONE_LOOKUP_HMAC_KEY}" # fill here`);
  assert.equal(result.content, expected);
  assert.deepEqual(result.updatedKeys, ['DATABASE_URL', 'PHONE_LOOKUP_HMAC_KEY']);
  assert.deepEqual(fillBlankEnvironment(result.content, additions), { content: result.content, updatedKeys: [] });
  const duplicate = `PHONE_ENCRYPTION_KEY="${secret}"\nPHONE_ENCRYPTION_KEY=\n`;
  assert.throws(() => fillBlankEnvironment(duplicate, additions), /PHONE_ENCRYPTION_KEY가 중복/);
  const duplicateBlank = 'PHONE_ENCRYPTION_KEY=\nexport PHONE_ENCRYPTION_KEY="" # duplicate blank\n';
  const filledDuplicate = fillBlankEnvironment(duplicateBlank, additions).content;
  assert.ok(filledDuplicate.includes('PHONE_ENCRYPTION_KEY="must-not-replace"\n'));
  assert.ok(filledDuplicate.includes('export PHONE_ENCRYPTION_KEY="must-not-replace" # duplicate blank\n'));
});
