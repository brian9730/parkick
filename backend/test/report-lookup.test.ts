import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it, type TestContext } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import {
  PrismaReportLookupRepository, type ReportLookupIdentity, type ReportLookupRepository,
} from '../src/repositories/ReportLookupRepository.js';
import { protectContact } from '../src/services/reports/phone.js';
import { ReportLookupService } from '../src/services/reports/ReportLookupService.js';
import type { PublicReportDetail, PublicReportSummary } from '../src/services/reports/reportLookupInput.js';

const origin = 'https://parkick.example';
const phone = '01011112222';
const otherPhone = '01033334444';
const lookupKey = randomBytes(32);
const encryptionKey = randomBytes(32);
const now = '2026-10-15T01:00:00.000Z';
const id = (index: number) => `PK-20261015-${index.toString(16).padStart(12, '0')}`;
const identity = (value: string) => {
  const stored = protectContact(value, encryptionKey, lookupKey, new Date(now));
  return { phoneIdentifier: stored.phoneIdentifier!, phoneHmacKeyVersion: stored.phoneHmacKeyVersion! };
};
const detail = (index: number): PublicReportDetail => ({
  publicId: id(index), createdAt: now, operatorName: null, categories: ['보행로 통행 방해'], status: 'RECEIVED',
  completionMethod: null, completedAt: null,
  history: [{ status: 'RECEIVED', createdAt: now, completionMethod: null, publicNote: null }],
});

class MemoryLookupRepository implements ReportLookupRepository {
  records: { identity: ReportLookupIdentity | null; data: PublicReportDetail }[] = [];
  calls: { identity: ReportLookupIdentity; page?: number; publicId?: string }[] = [];
  failing = false;
  closed = false;
  async list(key: ReportLookupIdentity, page: number): Promise<PublicReportSummary[]> {
    this.calls.push({ identity: key, page });
    if (this.failing) throw new Error('PRIVATE_DATABASE_ERROR phone=01011112222');
    return this.records.filter(row => row.identity?.phoneIdentifier === key.phoneIdentifier && row.identity?.phoneHmacKeyVersion === key.phoneHmacKeyVersion)
      .map(row => row.data).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.publicId.localeCompare(a.publicId))
      .slice((page - 1) * 20, (page - 1) * 20 + 21);
  }
  async detail(key: ReportLookupIdentity, publicId: string): Promise<PublicReportDetail | null> {
    this.calls.push({ identity: key, publicId });
    if (this.failing) throw new Error('PRIVATE_DATABASE_ERROR phone=01011112222');
    return this.records.find(row => row.identity?.phoneIdentifier === key.phoneIdentifier && row.identity?.phoneHmacKeyVersion === key.phoneHmacKeyVersion && row.data.publicId === publicId)?.data ?? null;
  }
  async close(): Promise<void> { this.closed = true; }
}

async function fixture(t: TestContext) {
  const repository = new MemoryLookupRepository();
  const config = readConfig({
    NODE_ENV: 'test', AI_PROVIDER: 'disabled', FRONTEND_ORIGIN: origin,
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
    PHONE_ENCRYPTION_KEY: encryptionKey.toString('base64'), PHONE_LOOKUP_HMAC_KEY: lookupKey.toString('base64'),
  });
  const app = await createApp(config, { reportLookupRepository: repository });
  t.after(() => app.closeResources());
  const list = (body: unknown = { phone }) => request(app).post('/api/reports/lookup').set('Origin', origin).send(body);
  const getDetail = (publicId = id(1), value = phone) => request(app).post(`/api/reports/lookup/${publicId}`).set('Origin', origin).send({ phone: value });
  return { repository, app, list, getDetail };
}

describe('Phase 5 phone-only public lookup', () => {
  it('displays canonical names for legacy operator codes in list/detail without changing stored rows', async t => {
    const { repository, list, getDetail } = await fixture(t);
    const values = ['kakao-bike', '일레클', '사용자가 적은 다른 업체', null];
    repository.records = values.map((operatorName, index) => ({ identity: identity(phone), data: { ...detail(index + 1), operatorName } }));
    const response = await list().expect(200);
    const byId = new Map(response.body.data.items.map((row: PublicReportSummary) => [row.publicId, row.operatorName]));
    assert.deepEqual(values.map((_value, index) => byId.get(id(index + 1))), ['카카오 T 바이크', '쏘카 일레클', '사용자가 적은 다른 업체', null]);
    assert.equal((await getDetail(id(1)).expect(200)).body.data.operatorName, '카카오 T 바이크');
    assert.deepEqual(repository.records.map(row => row.data.operatorName), values);
  });

  it('normalizes the submitted phone to the existing versioned HMAC and separates other/absent/old-version contact', async t => {
    const { repository, list, getDetail } = await fixture(t);
    repository.records = [
      { identity: identity(phone), data: detail(1) },
      { identity: identity(otherPhone), data: detail(2) },
      { identity: null, data: detail(3) },
      { identity: { ...identity(phone), phoneHmacKeyVersion: 'old-v0' }, data: detail(4) },
    ];
    const first = await list({ phone: ' 010-1111-2222 ' }).expect(200);
    assert.equal(first.headers['cache-control'], 'no-store');
    assert.deepEqual(first.body.data.items.map((row: PublicReportSummary) => row.publicId), [id(1)]);
    assert.deepEqual((await list().expect(200)).body, first.body);
    assert.deepEqual(repository.calls[0]?.identity, identity(phone));
    assert.equal(JSON.stringify(repository.calls).includes(phone), false);
    assert.deepEqual((await list({ phone: otherPhone }).expect(200)).body.data.items.map((row: PublicReportSummary) => row.publicId), [id(2)]);
    const wrong = await getDetail(id(1), otherPhone).expect(404);
    const missing = await getDetail(id(999)).expect(404);
    const withoutContact = await getDetail(id(3)).expect(404);
    for (const result of [wrong, missing, withoutContact]) {
      assert.equal(result.body.error.code, 'REPORT_NOT_FOUND');
      assert.equal(result.body.error.message, wrong.body.error.message);
      assert.equal(result.headers['cache-control'], 'no-store');
    }
  });

  it('returns bounded deterministic pages without duplicates and an empty list for an unmatched phone', async t => {
    const { repository, list } = await fixture(t);
    repository.records = Array.from({ length: 23 }, (_, index) => ({ identity: identity(phone), data: detail(index + 1) }));
    const first = (await list().expect(200)).body.data;
    const second = (await list({ phone, page: 2 }).expect(200)).body.data;
    assert.deepEqual({ page: first.page, pageSize: first.pageSize, hasMore: first.hasMore }, { page: 1, pageSize: 20, hasMore: true });
    assert.deepEqual(first.items.map((row: PublicReportSummary) => row.publicId), Array.from({ length: 20 }, (_, i) => id(23 - i)));
    assert.deepEqual(second.items.map((row: PublicReportSummary) => row.publicId), [id(3), id(2), id(1)]);
    assert.equal(second.hasMore, false);
    assert.deepEqual((await list({ phone: otherPhone }).expect(200)).body.data, { items: [], page: 1, pageSize: 20, hasMore: false });
    assert.deepEqual((await list({ phone, page: 1000 }).expect(200)).body.data, { items: [], page: 1000, pageSize: 20, hasMore: false });
  });

  it('allows only public summary/history fields and preserves completion details', async t => {
    const { repository, list, getDetail } = await fixture(t);
    const visible = detail(1);
    visible.status = 'COMPLETED';
    visible.completionMethod = 'TOWED';
    visible.completedAt = '2026-10-15T03:00:00.000Z';
    visible.history.push({ status: 'PROCESSING', createdAt: '2026-10-15T02:00:00.000Z', completionMethod: null, publicNote: '담당자가 확인했습니다.' });
    visible.history.push({ status: 'COMPLETED', createdAt: visible.completedAt, completionMethod: 'TOWED', publicNote: '견인 완료' });
    const privateValue = 'PRIVATE_MUST_NOT_APPEAR';
    Object.assign(visible, { phone, phoneIdentifier: privateValue, contactPhoneCipher: privateValue, finalReportText: privateValue,
      address: privateValue, latitude: 37, longitude: 127, images: [privateValue], adminId: privateValue, internalNote: privateValue });
    Object.assign(visible.history[1]!, { adminId: privateValue, internalNote: privateValue });
    repository.records.push({ identity: identity(phone), data: visible });
    const summary = (await list().expect(200)).body.data.items[0];
    assert.deepEqual(Object.keys(summary).sort(), ['categories', 'completedAt', 'completionMethod', 'createdAt', 'operatorName', 'publicId', 'status']);
    const response = await getDetail().expect(200);
    assert.equal(response.body.data.status, 'COMPLETED');
    assert.equal(response.body.data.completionMethod, 'TOWED');
    assert.equal(response.body.data.completedAt, visible.completedAt);
    assert.deepEqual(response.body.data.history.map((event: { status: string }) => event.status), ['RECEIVED', 'PROCESSING', 'COMPLETED']);
    assert.equal(response.body.data.history[2].publicNote, '견인 완료');
    assert.deepEqual(Object.keys(response.body.data.history[1]).sort(), ['completionMethod', 'createdAt', 'publicNote', 'status']);
    assert.equal(JSON.stringify(response.body).includes(privateValue), false);
    assert.equal(JSON.stringify(response.body).includes(phone), false);
    assert.equal(response.headers['cache-control'], 'no-store');
  });

  it('rejects blank/invalid contact, unexpected fields and out-of-range pages before any repository query', async t => {
    const { repository, list, getDetail } = await fixture(t);
    for (const body of [
      {}, { phone: '' }, { phone: '   ' }, { phone: null }, { phone: 1011112222 },
      { phone: '01111112222' }, { phone: '0101111222' }, { phone: '010 1111 2222' },
      { phone, page: 0 }, { phone, page: -1 }, { phone, page: 1001 }, { phone, page: 1.5 }, { phone, page: '1' },
      { phone, pageSize: 100 }, { phone, phoneIdentifier: 'forged' }, { phone, tenantId: 'forged' }, { phone, cursor: 'unexpected' },
    ]) {
      const response = await list(body).expect(400);
      assert.equal(response.body.error.code, 'INVALID_INPUT');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(JSON.stringify(response.body).includes(phone), false);
    }
    await getDetail('not-a-report-id').expect(404);
    assert.equal(repository.calls.length, 0);
  });

  it('retains Origin/JSON/body boundaries and does not accept phone or pagination in URLs', async t => {
    const { repository, app } = await fixture(t);
    const failures = [
      await request(app).post('/api/reports/lookup').send({ phone }).expect(403),
      await request(app).post('/api/reports/lookup').set('Origin', 'https://other.example').send({ phone }).expect(403),
      await request(app).post('/api/reports/lookup').set('Origin', origin).type('form').send({ phone }).expect(415),
      await request(app).post('/api/reports/lookup').set('Origin', origin).field('phone', phone).expect(415),
      await request(app).get(`/api/reports/lookup?phone=${phone}`).expect(404),
      await request(app).post(`/api/reports/lookup?phone=${phone}`).set('Origin', origin).send({ phone }).expect(400),
      await request(app).post('/api/reports/lookup').set('Origin', origin).set('Content-Type', 'application/json').send('{').expect(400),
      await request(app).post('/api/reports/lookup').set('Origin', origin).send({ phone, filler: 'x'.repeat(17000) }).expect(413),
      await request(app).post(`/api/reports/lookup/${id(1)}`).set('Origin', origin).send({ phone, page: 1 }).expect(400),
    ];
    for (const result of failures) assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(repository.calls.length, 0);
  });

  it('shares a twenty-per-minute IP limit across list and detail and ignores forged forwarding headers', async t => {
    const { app } = await fixture(t);
    for (let index = 0; index < 20; index++) {
      const path = index % 2 ? `/api/reports/lookup/${id(1)}` : '/api/reports/lookup';
      await request(app).post(path).set('Origin', origin).set('X-Forwarded-For', `198.51.100.${index + 1}`).send({ phone }).expect(index % 2 ? 404 : 200);
    }
    for (const path of ['/api/reports/lookup', `/api/reports/lookup/${id(1)}`]) {
      const response = await request(app).post(path).set('Origin', origin).send({ phone }).expect(429);
      assert.equal(response.body.error.code, 'TOO_MANY_REQUESTS');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.ok(response.headers['retry-after']);
    }
  });

  it('fails safely when lookup is unconfigured or the repository fails, and closes its connection', async t => {
    const disabled = await createApp(readConfig({ NODE_ENV: 'test', FRONTEND_ORIGIN: origin }));
    t.after(() => disabled.closeResources());
    const unavailable = await request(disabled).post('/api/reports/lookup').set('Origin', origin).send({ phone }).expect(503);
    assert.equal(unavailable.body.error.code, 'LOOKUP_UNAVAILABLE');
    assert.equal(unavailable.headers['cache-control'], 'no-store');
    const { repository, app, list, getDetail } = await fixture(t);
    repository.failing = true;
    for (const response of [await list().expect(503), await getDetail().expect(503)]) {
      assert.equal(response.body.error.code, 'LOOKUP_UNAVAILABLE');
      assert.equal(JSON.stringify(response.body).includes('PRIVATE_DATABASE_ERROR'), false);
      assert.equal(JSON.stringify(response.body).includes(phone), false);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    await app.closeResources();
    assert.equal(repository.closed, true);
  });
});

it('selects only public DB columns, always filters by identifier+version, and bounds page reads', async () => {
  let listQuery: Prisma.ReportFindManyArgs | undefined;
  let detailQuery: Prisma.ReportFindFirstArgs | undefined;
  const client = { report: {
    findMany: async (query: Prisma.ReportFindManyArgs) => { listQuery = query; return []; },
    findFirst: async (query: Prisma.ReportFindFirstArgs) => { detailQuery = query; return null; },
  } } as unknown as Pick<PrismaClient, 'report'>;
  const repository = new PrismaReportLookupRepository('unused', client);
  await repository.list(identity(phone), 2);
  assert.deepEqual(listQuery?.where, identity(phone));
  assert.deepEqual(listQuery?.orderBy, [{ createdAt: 'desc' }, { publicId: 'desc' }]);
  assert.equal(listQuery?.skip, 20);
  assert.equal(listQuery?.take, 21);
  await repository.detail(identity(phone), id(1));
  assert.deepEqual(detailQuery?.where, { ...identity(phone), publicId: id(1) });
  assert.deepEqual(Object.keys(listQuery?.select ?? {}).sort(), ['categories', 'completedAt', 'completionMethod', 'createdAt', 'operatorName', 'publicId', 'status']);
  const history = detailQuery?.select?.statusHistory as { select: Record<string, boolean> };
  assert.deepEqual(Object.keys(history.select).sort(), ['completionMethod', 'createdAt', 'newStatus', 'publicNote']);
  listQuery = undefined;
  for (const invalid of [{ phoneIdentifier: '', phoneHmacKeyVersion: 'local-v1' }, { phoneIdentifier: identity(phone).phoneIdentifier, phoneHmacKeyVersion: '' }]) {
    await assert.rejects(repository.list(invalid, 1));
  }
  await assert.rejects(repository.list(identity(phone), 1001));
  assert.equal(listQuery, undefined);
  await repository.close();
});

it('does not advertise pages past the configured maximum even if more matches exist', async () => {
  const repository = new MemoryLookupRepository();
  repository.list = async () => Array.from({ length: 21 }, (_, index) => detail(index + 1));
  const response = await new ReportLookupService(lookupKey, repository).list({ phone, page: 1000 });
  assert.equal(response.items.length, 20);
  assert.equal(response.hasMore, false);
});
