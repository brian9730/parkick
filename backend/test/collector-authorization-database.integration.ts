import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { after, before, describe, it, type TestContext } from 'node:test';
import sharp from 'sharp';
import request from 'supertest';
import { assertTaskLocalDatabase, localTestDatabaseUrl } from '../scripts/local-database.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/services/admin/password.js';
import { protectContact } from '../src/services/reports/phone.js';
import { LocalEvidenceStorage } from '../src/services/storage/LocalEvidenceStorage.js';

// This test must never use the production URL or the user's backend/.env.
const databaseUrl = process.env.TEST_DATABASE_URL || localTestDatabaseUrl;
assertTaskLocalDatabase(databaseUrl, true);
assert.equal(new URL(databaseUrl).pathname, '/parkick_test');
const client = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
const origin = 'https://parkick.example';
const password = randomBytes(24).toString('base64url');
const privateInternalNote = 'PRIVATE_INTERNAL_NOTE_FOR_COLLECTOR_TEST';
const privatePhone = '01012341234';
let passwordHash: string;

async function fixture(t: TestContext) {
  const prefix = `collector-test-${randomUUID()}`;
  const tenantIds = [randomUUID(), randomUUID()];
  const regionIds = [randomUUID(), randomUUID()];
  const adminIds = [randomUUID(), randomUUID(), randomUUID()];
  const reportIds = [randomUUID(), randomUUID()];
  const publicIds = reportIds.map(() => `PK-20261103-${randomBytes(6).toString('hex')}`);
  const root = await mkdtemp(join(tmpdir(), 'parkick-collector-db-'));
  const storage = new LocalEvidenceStorage(root);
  const image = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#679abe' } }).jpeg().toBuffer();
  const prepared = await storage.prepare([{ originalname: 'fixture.jpg', mimetype: 'image/jpeg', buffer: image }]);
  const saved = await storage.save(prepared);
  const imageId = randomUUID();
  const encryptionKey = randomBytes(32);
  const lookupKey = randomBytes(32);
  const now = new Date();
  const runtime: { app?: Awaited<ReturnType<typeof createApp>> } = {};

  t.after(async () => {
    await runtime.app?.closeResources();
    await client.$transaction(async transaction => {
      await transaction.reportFieldFinding.deleteMany({ where: { reportId: { in: reportIds } } });
      await transaction.report.deleteMany({ where: { id: { in: reportIds }, publicId: { in: publicIds } } });
      await transaction.admin.deleteMany({ where: { id: { in: adminIds }, email: { endsWith: `@${prefix}.invalid` } } });
      await transaction.region.deleteMany({ where: { id: { in: regionIds }, tenantId: { in: tenantIds } } });
      await transaction.tenant.deleteMany({ where: { id: { in: tenantIds }, code: { startsWith: prefix } } });
    });
    const child = relative(tmpdir(), root);
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    await rm(root, { recursive: true, force: true });
  });

  await client.$transaction(async transaction => {
    for (let index = 0; index < 2; index += 1) {
      await transaction.tenant.create({ data: { id: tenantIds[index]!, code: `${prefix}-${index}`, name: `Test tenant ${index}` } });
      await transaction.region.create({ data: { id: regionIds[index]!, tenantId: tenantIds[index]!, code: `${prefix}-${index}`, name: `Test region ${index}` } });
    }
    for (let index = 0; index < 3; index += 1) {
      await transaction.admin.create({ data: {
        id: adminIds[index]!, email: `${index}@${prefix}.invalid`, passwordHash, name: `Staff ${index}`,
        role: index === 0 ? 'TENANT_ADMIN' : 'COLLECTOR', tenantId: tenantIds[index === 2 ? 1 : 0]!,
      } });
    }
    for (let index = 0; index < 2; index += 1) {
      await transaction.report.create({ data: {
        id: reportIds[index]!, publicId: publicIds[index]!, submissionId: randomUUID(), submissionHash: randomBytes(32).toString('hex'),
        tenantId: tenantIds[index]!, regionId: regionIds[index]!, latitude: 37.123456 + index, longitude: 127.123456,
        operatorName: 'Beam', deviceId: `TEST-${index}`, address: `Test address ${index}`,
        finalReportText: 'Shared scooter at this location',
        createdAt: now, updatedAt: now,
        ...protectContact(index === 0 ? privatePhone : null, encryptionKey, lookupKey, now),
        ...(index === 0 ? { images: { create: { ...saved.images[0]!, id: imageId } } } : {}),
        statusHistory: { create: { newStatus: 'RECEIVED', createdAt: now } },
      } });
    }
  });

  const config = readConfig({
    NODE_ENV: 'test', AI_PROVIDER: 'disabled', FRONTEND_ORIGIN: origin, DATABASE_URL: databaseUrl,
    REPORT_STORAGE_DIR: root, PHONE_ENCRYPTION_KEY: encryptionKey.toString('base64'),
    PHONE_LOOKUP_HMAC_KEY: lookupKey.toString('base64'),
  });
  const app = await createApp(config, { reportStorage: storage });
  runtime.app = app;
  const cookies: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const login = await request(app).post('/api/admin/auth/login').set('Origin', origin)
      .send({ email: `${index}@${prefix}.invalid`, password }).expect(200);
    assert.equal(login.body.data.admin.role, index === 0 ? 'TENANT_ADMIN' : 'COLLECTOR');
    assert.equal(login.body.data.admin.tenantId, tenantIds[index === 2 ? 1 : 0]);
    cookies.push(login.headers['set-cookie'][0]!.split(';')[0]!);
  }

  const get = (path: string, actor: number) => request(app).get(`/api/admin${path}`).set('Cookie', cookies[actor]!);
  const post = (path: string, actor: number, body: object) => request(app).post(`/api/admin${path}`)
    .set('Origin', origin).set('Cookie', cookies[actor]!).send(body);
  const patch = (path: string, actor: number, body: object) => request(app).patch(`/api/admin${path}`)
    .set('Origin', origin).set('Cookie', cookies[actor]!).send(body);
  return { get, post, patch, publicIds, imageId, reportIds, adminIds, tenantIds };
}

describe('Collector permissions and field findings (isolated PostgreSQL test database)', () => {
  before(async () => { await client.$connect(); passwordHash = await hashPassword(password); });
  after(async () => { await client.$disconnect(); });

  it('separates routes by role and prevents cross-tenant detail and photo access', async t => {
    const f = await fixture(t);
    for (const path of ['/dashboard', '/reports', '/reports/map', '/reports/hotspots',
      `/reports/${f.publicIds[0]}`, `/reports/${f.publicIds[0]}/images/${f.imageId}`]) {
      await f.get(path, 1).expect(403);
    }
    await f.patch(`/reports/${f.publicIds[0]}/status`, 1,
      { status: 'REJECTED', expectedUpdatedAt: new Date().toISOString(), publicNote: 'Forged rejection' }).expect(403);
    await f.get('/collection/reports/map', 0).expect(403);
    await f.get('/collection/reports/nearby?latitude=37&longitude=127', 0).expect(403);
    await f.get(`/collection/reports/${f.publicIds[0]}`, 0).expect(403);

    const own = await f.get(`/collection/reports/${f.publicIds[0]}`, 1).expect(200);
    assert.equal(own.body.data.publicId, f.publicIds[0]);
    assert.equal(own.body.data.tenant.id, f.tenantIds[0]);
    await f.get(`/collection/reports/${f.publicIds[1]}`, 1).expect(404);
    await f.get(`/collection/reports/${f.publicIds[0]}/images/${f.imageId}`, 1).expect(200);
    await f.get(`/collection/reports/${f.publicIds[0]}/images/${f.imageId}`, 2).expect(404);
    await f.get(`/collection/reports/${f.publicIds[1]}/images/${f.imageId}`, 1).expect(404);
    await f.patch(`/collection/reports/${f.publicIds[1]}/complete`, 1,
      { expectedUpdatedAt: own.body.data.updatedAt }).expect(404);
    await f.post(`/collection/reports/${f.publicIds[1]}/missing`, 1,
      { expectedUpdatedAt: own.body.data.updatedAt, note: 'Forged finding' }).expect(404);
    await f.get(`/collection/reports/map?tenantId=${f.tenantIds[1]}`, 1).expect(400);
    await f.patch(`/collection/reports/${f.publicIds[0]}/complete`, 1,
      { expectedUpdatedAt: own.body.data.updatedAt, status: 'REJECTED' }).expect(400);
  });

  it('returns only pending own-tenant reports without contact or internal notes', async t => {
    const f = await fixture(t);
    const initial = await f.get(`/reports/${f.publicIds[0]}`, 0).expect(200);
    await f.patch(`/reports/${f.publicIds[0]}/status`, 0, {
      status: 'PROCESSING', expectedUpdatedAt: initial.body.data.updatedAt, internalNote: privateInternalNote,
    }).expect(200);

    const page = await f.get('/collection/reports/nearby?latitude=37.123456&longitude=127.123456', 1).expect(200);
    assert.equal(page.body.data.total, 1);
    assert.equal(page.body.data.items[0].publicId, f.publicIds[0]);
    const map = await f.get('/collection/reports/map', 1).expect(200);
    assert.equal(map.body.data.total, 1);
    assert.equal(map.body.data.items[0].publicId, f.publicIds[0]);
    const detail = await f.get(`/collection/reports/${f.publicIds[0]}`, 1).expect(200);
    const serialized = JSON.stringify({ page: page.body, map: map.body, detail: detail.body });
    for (const secret of [privatePhone, 'contactPhoneMasked', 'contactPhoneCipher', privateInternalNote,
      'internalNote', 'phoneIdentifier', 'qrRawData']) {
      assert.equal(serialized.includes(secret), false, `Collector response exposed ${secret}`);
    }
    assert.equal(detail.body.data.images[0].url,
      `/api/admin/collection/reports/${f.publicIds[0]}/images/${f.imageId}`);
  });

  it('records device-not-found for manager review without rejecting, then records final manager rejection', async t => {
    const f = await fixture(t);
    const reportId = f.publicIds[0]!;
    const detail = await f.get(`/collection/reports/${reportId}`, 1).expect(200);
    const missing = await f.post(`/collection/reports/${reportId}/missing`, 1, {
      expectedUpdatedAt: detail.body.data.updatedAt, note: 'No device found at reported location.',
    }).expect(200);
    assert.equal(missing.body.data.status, 'RECEIVED');
    const dbReport = await client.report.findUniqueOrThrow({ where: { id: f.reportIds[0] } });
    assert.equal(dbReport.status, 'RECEIVED');
    const finding = await client.reportFieldFinding.findFirstOrThrow({ where: { reportId: f.reportIds[0] } });
    assert.equal(finding.status, 'PENDING_REVIEW');
    assert.equal(finding.collectorId, f.adminIds[1]);
    assert.equal(finding.note, 'No device found at reported location.');

    const managerDetail = await f.get(`/reports/${reportId}`, 0).expect(200);
    assert.equal(managerDetail.body.data.fieldFindings[0].status, 'PENDING_REVIEW');
    const rejected = await f.patch(`/reports/${reportId}/status`, 0, {
      status: 'REJECTED', expectedUpdatedAt: managerDetail.body.data.updatedAt,
      publicNote: 'Device was not present when staff checked the location.',
    }).expect(200);
    assert.equal(rejected.body.data.status, 'REJECTED');
    const reviewed = await client.reportFieldFinding.findUniqueOrThrow({ where: { id: finding.id } });
    assert.equal(reviewed.status, 'REVIEWED');
    assert.equal(reviewed.reviewedByAdminId, f.adminIds[0]);
    await f.get(`/collection/reports/${reportId}`, 1).expect(404);
  });

  it('allows collection completion only with a current version and removes completed reports from the queue', async t => {
    const f = await fixture(t);
    const reportId = f.publicIds[0]!;
    const detail = await f.get(`/collection/reports/${reportId}`, 1).expect(200);
    const stale = new Date(new Date(detail.body.data.updatedAt).getTime() - 1000).toISOString();
    await f.patch(`/collection/reports/${reportId}/complete`, 1, { expectedUpdatedAt: stale }).expect(409);
    const done = await f.patch(`/collection/reports/${reportId}/complete`, 1,
      { expectedUpdatedAt: detail.body.data.updatedAt }).expect(200);
    assert.equal(done.body.data.status, 'COMPLETED');
    assert.equal(done.body.data.completionMethod, 'COLLECTED');
    const stored = await client.report.findUniqueOrThrow({ where: { id: f.reportIds[0] } });
    assert.equal(stored.completedByAdminId, f.adminIds[1]);
    assert.equal((await f.get('/collection/reports/map', 1).expect(200)).body.data.total, 0);
  });
});
