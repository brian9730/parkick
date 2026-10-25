import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { ApiError } from '../src/middleware/errors.js';
import { EmptyAdminOverviewRepository } from '../src/repositories/AdminOverviewRepository.js';
import { PrismaAdminReportRepository } from '../src/repositories/AdminReportRepository.js';
import { AdminOverviewService } from '../src/services/admin/AdminOverviewService.js';
import { adminNearbyReportQuery, adminReportMapQuery, adminReportQuery, adminReportTransition, reportScope } from '../src/services/admin/adminReportInput.js';
import { LocalEvidenceStorage } from '../src/services/storage/LocalEvidenceStorage.js';

const input = { status: 'PROCESSING', expectedUpdatedAt: new Date().toISOString() };
const apiError = (status: number) => (error: unknown) => error instanceof ApiError && error.status === status;

describe('Administrator report validation and private local photo reads', () => {
  it('normalizes legacy operator names across dashboard/list/map/detail and keeps alias searches tenant-scoped', async () => {
    const storedNames = ['kakao-bike', 'BEAM', '지쿠터', '기존에 직접 입력한 업체', null];
    const now = new Date('2026-10-16T00:00:00.000Z');
    const tenantId = randomUUID();
    const rows = storedNames.map((operatorName, index) => ({
      publicId: `PK-20261016-${index.toString(16).padStart(12, '0')}`, createdAt: now, updatedAt: now,
      status: 'PROCESSING', completionMethod: null, completedAt: null, operatorName, deviceId: null, address: null,
      categories: [], tenant: { id: tenantId, name: '테스트 지자체' }, region: { id: randomUUID(), name: '테스트 지역' },
      latitude: { toNumber: () => 37.5 }, longitude: { toNumber: () => 127.0 },
      finalReportText: '사용자가 작성한 원문', userDescription: null, contactPhoneMasked: null, images: [], statusHistory: [],
    }));
    const queries: Prisma.ReportFindManyArgs[] = [];
    const counts: Prisma.ReportCountArgs[] = [];
    const details: Prisma.ReportFindFirstArgs[] = [];
    const client = {
      report: {
        findMany: async (query: Prisma.ReportFindManyArgs) => { queries.push(query); return rows; },
        count: async (query: Prisma.ReportCountArgs) => { counts.push(query); return rows.length; },
        findFirst: async (query: Prisma.ReportFindFirstArgs) => { details.push(query); return rows[0]; },
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    } as unknown as PrismaClient;
    const repository = new PrismaAdminReportRepository('unused', client);
    const scope = { adminId: randomUUID(), role: 'TENANT_ADMIN' as const, tenantId };
    const expected = ['카카오 T 바이크', '빔', '지쿠', '기존에 직접 입력한 업체', null];
    assert.deepEqual((await repository.dashboard(scope)).recentReports.map(row => row.operatorName), expected);
    for (const q of ['카카오', 'kakao-bike']) {
      assert.deepEqual((await repository.list(scope, adminReportQuery.parse({ q, status: 'PROCESSING' }))).items.map(row => row.operatorName), expected);
      assert.deepEqual((await repository.map(scope, adminReportMapQuery.parse({ q, status: 'PROCESSING' }))).items.map(row => row.operatorName), expected);
      const where = queries.at(-1)!.where!;
      assert.equal(where.tenantId, tenantId);
      assert.equal(where.status, 'PROCESSING');
      const alternatives = where.OR!;
      assert.ok(alternatives.some(value => JSON.stringify(value).includes('kakao-bike')));
      assert.ok(alternatives.some(value => JSON.stringify(value).includes('카카오 T 바이크')));
      assert.deepEqual(counts.at(-1)!.where, where);
    }
    assert.equal((await repository.detail(scope, rows[0]!.publicId)).operatorName, expected[0]);
    assert.equal(details[0]!.where!.tenantId, tenantId);
    assert.deepEqual(rows.map(row => row.operatorName), storedNames);
    await repository.close();
  });

  it('bounds map pages separately from the smaller report table and rejects unsafe search or ownership parameters', () => {
    assert.deepEqual(adminReportMapQuery.parse({}), { page: 1, pageSize: 200, q: '' });
    assert.equal(adminReportMapQuery.parse({ pageSize: '500', page: '10000', status: 'COMPLETED', q: '  지역  ' }).q, '지역');
    assert.equal(adminReportQuery.safeParse({ pageSize: 500 }).success, false);
    for (const query of [{ page: 0 }, { page: 10001 }, { pageSize: 501 }, { pageSize: 0 }, { pageSize: 1.5 },
      { q: 'x'.repeat(101) }, { q: '\0' }, { tenantId: randomUUID() }, { role: 'PLATFORM_ADMIN' }, { status: '' }, { page: 'all' }]) {
      assert.equal(adminReportMapQuery.safeParse(query).success, false);
    }
  });

  it('requires finite nearby coordinates, bounded pages, and no caller-supplied tenant scope', () => {
    assert.deepEqual(adminNearbyReportQuery.parse({ latitude: '37.123456', longitude: '127.123456' }),
      { latitude: 37.123456, longitude: 127.123456, page: 1, pageSize: 200 });
    for (const query of [{ longitude: '127' }, { latitude: '37' }, { latitude: '', longitude: '127' },
      { latitude: 'NaN', longitude: '127' }, { latitude: 'Infinity', longitude: '127' },
      { latitude: '91', longitude: '127' }, { latitude: '37', longitude: '-181' },
      { latitude: '37', longitude: '127', tenantId: randomUUID() },
      { latitude: '37', longitude: '127', status: 'COMPLETED' },
      { latitude: '37', longitude: '127', pageSize: 501 },
      { latitude: '37', longitude: '127', page: 0 }]) {
      assert.equal(adminNearbyReportQuery.safeParse(query).success, false);
    }
  });

  it('bounds pagination, search and notes and requires a method only for completion', () => {
    assert.deepEqual(adminReportQuery.parse({}), { page: 1, pageSize: 20, q: '' });
    assert.equal(adminReportQuery.parse({ q: '  기기  ' }).q, '기기');
    for (const query of [{ page: 0 }, { page: 10001 }, { pageSize: 101 }, { pageSize: 0 }, { q: 'x'.repeat(101) }, { q: 'bad\0query' }, { tenantId: randomUUID() }, { status: 'invalid' }]) {
      assert.equal(adminReportQuery.safeParse(query).success, false);
    }
    assert.equal(adminReportTransition.parse({ ...input, publicNote: '  확인 중  ' }).publicNote, '확인 중');
    assert.equal(adminReportTransition.safeParse({ ...input, status: 'COMPLETED', completionMethod: 'TOWED' }).success, true);
    assert.equal(adminReportTransition.safeParse({ ...input, status: 'REJECTED', publicNote: '신고 대상 아님' }).success, true);
    assert.equal(adminReportQuery.parse({ status: 'REJECTED' }).status, 'REJECTED');
    for (const change of [{ ...input, status: 'RECEIVED' }, { ...input, status: 'COMPLETED' }, { ...input, completionMethod: 'COLLECTED' },
      { ...input, status: 'REJECTED', completionMethod: 'COLLECTED' },
      { ...input, expectedUpdatedAt: 'today' }, { ...input, internalNote: 'x'.repeat(1001) }, { ...input, publicNote: 'x'.repeat(1001) }, { ...input, adminId: randomUUID() }, { ...input, publicNote: '\0' }, { ...input, internalNote: '\0' }]) {
      assert.equal(adminReportTransition.safeParse(change).success, false);
    }
  });

  it('keeps role-less mocks on the skeleton and rejects malformed DB scopes without issuing queries', async () => {
    const mock = { id: randomUUID(), email: 'mock@example.test', name: 'Mock' };
    const service = new AdminOverviewService(new EmptyAdminOverviewRepository());
    assert.equal((await service.getDashboard(mock)).mode, 'skeleton');
    assert.equal((await service.getReports(mock, adminReportQuery.parse({}))).mode, 'skeleton');
    assert.deepEqual(await service.getMap(mock, adminReportMapQuery.parse({})), { mode: 'skeleton', items: [], total: 0, page: 1, pageSize: 200 });
    assert.deepEqual(await service.getNearby(mock, adminNearbyReportQuery.parse({ latitude: 37, longitude: 127 })),
      { mode: 'skeleton', items: [], total: 0, page: 1, pageSize: 200 });
    assert.throws(() => service.detail(mock, 'unknown'), apiError(501));
    await assert.rejects(service.image(mock, 'unknown', randomUUID()), apiError(501));
    assert.throws(() => reportScope({ ...mock, role: 'TENANT_ADMIN', tenantId: null }), apiError(403));
    const repository = new PrismaAdminReportRepository('postgresql://unused:unused@127.0.0.1:1/unused');
    try {
      await assert.rejects(repository.list({ adminId: mock.id, role: 'TENANT_ADMIN', tenantId: null }, adminReportQuery.parse({})), apiError(403));
      await assert.rejects(repository.detail({ adminId: mock.id, role: 'PLATFORM_ADMIN', tenantId: randomUUID() }, 'unknown'), apiError(403));
      await assert.rejects(repository.map({ adminId: mock.id, role: 'TENANT_ADMIN', tenantId: null }, adminReportMapQuery.parse({})), apiError(403));
      await assert.rejects(repository.nearby({ adminId: mock.id, role: 'TENANT_ADMIN', tenantId: null },
        adminNearbyReportQuery.parse({ latitude: 37, longitude: 127 })), apiError(403));
    } finally { await repository.close(); }
  });

  it('reads a real normalized JPEG and rejects traversal, non-UUID paths, disguised data and missing files', async t => {
    const root = await mkdtemp(join(tmpdir(), 'parkick-admin-photo-'));
    t.after(async () => {
      const child = relative(tmpdir(), root);
      assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
      await rm(root, { recursive: true, force: true });
    });
    const storage = new LocalEvidenceStorage(root);
    const source = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#456789' } }).jpeg().toBuffer();
    const prepared = await storage.prepare([{ originalname: 'fixture.jpg', mimetype: 'image/jpeg', buffer: source }]);
    const saved = await storage.save(prepared);
    assert.deepEqual((await storage.read(saved.images[0]!.objectKey)).buffer, prepared[0]!.buffer);
    for (const key of ['../secret', '/secret', `${saved.directory}/../secret`, `${saved.directory}/plain.jpg`, `${saved.directory}\\${randomUUID()}.jpg`]) {
      await assert.rejects(storage.read(key), apiError(404));
    }
    await assert.rejects(storage.read(`${saved.directory}/${randomUUID()}.jpg`), apiError(404));
    const fakeKey = `${saved.directory}/${randomUUID()}.jpg`;
    await writeFile(join(root, fakeKey), '<script>PRIVATE_FILE</script>');
    await assert.rejects(storage.read(fakeKey), apiError(503));
  });

  it('refuses directory junctions and symlink roots even if their target contains a valid JPEG', async t => {
    const container = await mkdtemp(join(tmpdir(), 'parkick-admin-link-'));
    t.after(async () => {
      const child = relative(tmpdir(), container);
      assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
      await rm(container, { recursive: true, force: true });
    });
    const root = join(container, 'private');
    const outside = join(container, 'outside');
    await mkdir(root); await mkdir(outside);
    const directory = randomUUID(); const file = `${randomUUID()}.jpg`;
    await writeFile(join(outside, file), await sharp({ create: { width: 2, height: 2, channels: 3, background: '#abcdef' } }).jpeg().toBuffer());
    await symlink(outside, join(root, directory), 'junction');
    await assert.rejects(new LocalEvidenceStorage(root).read(`${directory}/${file}`), apiError(503));
    const rootLink = join(container, 'linked-root');
    await symlink(root, rootLink, 'junction');
    await assert.rejects(new LocalEvidenceStorage(rootLink).read(`${directory}/${file}`), apiError(503));
  });
});
