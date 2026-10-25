import assert from 'node:assert/strict';
import { createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, type TestContext } from 'node:test';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { ApiError } from '../src/middleware/errors.js';
import { ReportRepositoryError, type NewReport, type ReportRepository, type StoredReport } from '../src/repositories/ReportRepository.js';
import { LocalEvidenceStorage, MAX_PHOTO_BYTES } from '../src/services/storage/LocalEvidenceStorage.js';
import { protectContact } from '../src/services/reports/phone.js';
import { reportSubmissionSchema } from '../src/services/reports/reportInput.js';
import { ReportSubmissionService } from '../src/services/reports/ReportSubmissionService.js';
import type { PhotoValidator } from '../src/services/reports/PhotoValidationService.js';

const origin = 'http://localhost:5173';
const encryptionKey = randomBytes(32);
const lookupKey = randomBytes(32);
const environment = {
  NODE_ENV: 'test', AI_PROVIDER: 'disabled', DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
  PHONE_ENCRYPTION_KEY: encryptionKey.toString('base64'), PHONE_LOOKUP_HMAC_KEY: lookupKey.toString('base64'),
};
const payload = (overrides: Record<string, unknown> = {}) => ({
  submissionId: randomUUID(), operator: '직접 확인한 업체', deviceId: 'DEVICE-TEST', qrRawData: '  raw-qr\n',
  latitude: 37.5665123, longitude: 126.9780123, address: '테스트 장소', categories: ['보행로 통행 방해'],
  additionalDescription: '', phone: null, consent: false, ...overrides,
});
const photo = async () => ({ originalname: '현장.png', mimetype: 'image/png', buffer: await sharp({ create: { width: 4, height: 3, channels: 3, background: '#12ab45' } }).png().toBuffer() });
const allowPhotos: PhotoValidator = { mode: 'mock', configured: true, async validate() {} };

class MemoryRepository implements ReportRepository {
  readonly records = new Map<string, StoredReport>();
  readonly inputs: NewReport[] = [];
  available = true;
  failure: 'read' | 'create' | 'acknowledgement' | null = null;
  async isAvailable(): Promise<boolean> { return this.available; }
  async findBySubmissionId(id: string): Promise<StoredReport | null> {
    if (this.failure === 'read') throw new ReportRepositoryError('unavailable');
    return this.records.get(id) ?? null;
  }
  async create(report: NewReport): Promise<StoredReport> {
    // Yield so concurrent submission tests reach the unique constraint race.
    await new Promise<void>(done => setImmediate(done));
    if (this.failure === 'create') throw new ReportRepositoryError('unavailable');
    if (this.records.has(report.facts.submissionId)) throw new ReportRepositoryError('conflict');
    const stored: StoredReport = { id: report.id, submissionHash: report.submissionHash, receipt: {
      publicId: report.publicId, status: 'RECEIVED', createdAt: report.createdAt.toISOString(),
      address: report.facts.address, latitude: report.facts.latitude, longitude: report.facts.longitude,
      hasContact: report.contact.phoneIdentifier !== null,
    } };
    this.inputs.push(report);
    this.records.set(report.facts.submissionId, stored);
    if (this.failure === 'acknowledgement') throw new ReportRepositoryError('uncertain');
    return stored;
  }
  async close(): Promise<void> { /* No external connection in this test double. */ }
}

async function fixture(t: TestContext, overrides: NodeJS.ProcessEnv = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'parkick-report-test-'));
  t.after(async () => {
    const child = relative(resolve(tmpdir()), resolve(directory));
    assert.ok(child.startsWith('parkick-report-test-') && !child.includes('..') && !isAbsolute(child));
    await rm(directory, { recursive: true, force: true });
  });
  const config = readConfig({ ...environment, REPORT_STORAGE_DIR: directory, ...overrides });
  const repository = new MemoryRepository();
  const storage = new LocalEvidenceStorage(directory);
  const service = new ReportSubmissionService(config.reports!, repository, storage, allowPhotos);
  return { directory, config, repository, storage, service };
}

describe('Phase 4 local report configuration and contact privacy', () => {
  it('disables unconfigured storage, requires independent valid keys, and rejects implicit production local storage', async () => {
    assert.equal(readConfig({}).reports, undefined);
    assert.throws(() => readConfig({ ...environment, PHONE_ENCRYPTION_KEY: '' }), /PHONE_ENCRYPTION_KEY/);
    assert.throws(() => readConfig({ ...environment, PHONE_LOOKUP_HMAC_KEY: 'invalid' }), /PHONE_LOOKUP_HMAC_KEY/);
    assert.throws(() => readConfig({ ...environment, PHONE_LOOKUP_HMAC_KEY: environment.PHONE_ENCRYPTION_KEY }), /서로 다른/);
    assert.throws(() => readConfig({ ...environment, DATABASE_URL: 'https://example.test' }), /PostgreSQL/);
    assert.throws(() => readConfig({ ...environment, NODE_ENV: 'production' }), /REPORT_STORAGE_PROVIDER=local.*REPORT_STORAGE_DIR/);
    await assert.rejects(createApp({ ...readConfig(environment), environment: 'production' }), /HTTPS/);
  });

  it('allows an explicit absolute local directory in production while preserving HTTPS, DB password and development-only guards', () => {
    const production = {
      ...environment, NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://parkick.example',
      REPORT_STORAGE_PROVIDER: 'local', REPORT_STORAGE_DIR: resolve(tmpdir(), 'parkick-production-reports'),
    };
    const config = readConfig(production);
    assert.deepEqual(config.reports?.storage, { mode: 'local' });
    assert.equal(config.reports?.storageDir, production.REPORT_STORAGE_DIR);
    assert.equal(config.devAdmin, null);
    assert.deepEqual(config.ai, { mode: 'disabled' });
    for (const change of [
      { REPORT_STORAGE_PROVIDER: undefined }, { REPORT_STORAGE_DIR: undefined },
      { REPORT_STORAGE_DIR: '' }, { REPORT_STORAGE_DIR: 'data/reports' },
    ]) assert.throws(() => readConfig({ ...production, ...change }), /REPORT_STORAGE_PROVIDER=local.*REPORT_STORAGE_DIR/);
    assert.throws(() => readConfig({ ...production, FRONTEND_ORIGIN: 'http://parkick.example' }), /HTTPS/);
    assert.throws(() => readConfig({ ...production, DATABASE_URL: 'postgresql://unused@127.0.0.1:1/unused' }), /DATABASE_URL/);
    assert.throws(() => readConfig({ ...production, ENABLE_DEV_ADMIN: 'true' }), /MOCK/);
    assert.throws(() => readConfig({ ...production, AI_PROVIDER: 'mock' }), /MOCK/);
  });

  it('rejects unsafe production report settings even when config is injected directly', async () => {
    const production = readConfig({
      ...environment, NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://parkick.example',
      REPORT_STORAGE_PROVIDER: 'local', REPORT_STORAGE_DIR: resolve(tmpdir(), 'parkick-production-reports'),
    });
    for (const storageDir of ['', 'data/reports']) {
      await assert.rejects(createApp({ ...production, reports: { ...production.reports!, storageDir } }), /REPORT_STORAGE_DIR/);
    }
    await assert.rejects(createApp({ ...production, reports: { ...production.reports!, storage: undefined } }), /REPORT_STORAGE_PROVIDER/);
    await assert.rejects(createApp({ ...production, frontendOrigin: 'http://parkick.example' }), /HTTPS/);
    await assert.rejects(createApp({ ...production, reports: { ...production.reports!, databaseUrl: 'postgresql://unused@127.0.0.1:1/unused' } }), /DATABASE_URL/);
  });

  it('requires consent only for valid normalized contact and rejects client ownership/status fields', () => {
    assert.equal(reportSubmissionSchema.parse(payload()).phone, null);
    assert.equal(reportSubmissionSchema.parse(payload({ phone: '', consent: true })).phone, null);
    assert.equal(reportSubmissionSchema.parse(payload({ phone: '010-1234-5678', consent: true })).phone, '01012345678');
    for (const change of [
      { phone: '01012345678', consent: false }, { phone: '0111234567', consent: true }, { phone: '0101234567', consent: true },
      { tenantId: randomUUID() }, { regionId: randomUUID() }, { status: 'COMPLETED' }, { adminId: randomUUID() },
      { aiGeneratedText: 'invented metadata' }, { reportConfirmed: false }, { categories: ['알 수 없는 유형'] },
      { categories: ['차도', '차도'] }, { latitude: 91 }, { longitude: -181 },
      { finalReportText: '   ' }, { additionalDescription: 'x'.repeat(501) },
    ]) assert.equal(reportSubmissionSchema.safeParse(payload(change)).success, false);
    const result = reportSubmissionSchema.parse(payload());
    assert.equal(result.qrRawData, '  raw-qr\n');
    assert.equal(result.latitude, 37.566512);
  });

  it('keeps all seven fields null without contact; encrypts with random nonce and stable keyed lookup identifier', () => {
    const now = new Date();
    assert.deepEqual(Object.values(protectContact(null, encryptionKey, lookupKey, now)), Array(7).fill(null));
    const first = protectContact('01012345678', encryptionKey, lookupKey, now);
    const second = protectContact('01012345678', encryptionKey, lookupKey, now);
    assert.equal(first.phoneIdentifier, second.phoneIdentifier);
    assert.notDeepEqual(first.contactPhoneCipher, second.contactPhoneCipher);
    assert.equal(first.contactPhoneMasked, '010-****-5678');
    assert.equal(first.consentedAt, now);
    const envelope = Buffer.from(first.contactPhoneCipher!);
    assert.equal(envelope[0], 1);
    assert.equal(envelope.includes(Buffer.from('01012345678')), false);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, envelope.subarray(1, 13));
    decipher.setAAD(Buffer.from('parkick-contact-local-v1'));
    decipher.setAuthTag(envelope.subarray(13, 29));
    assert.equal(Buffer.concat([decipher.update(envelope.subarray(29)), decipher.final()]).toString(), '01012345678');
    assert.notEqual(protectContact('01012345678', encryptionKey, randomBytes(32), now).phoneIdentifier, first.phoneIdentifier);
  });
});

describe('Phase 4 private photo handling', () => {
  it('decodes and re-encodes real images, strips EXIF, applies orientation and stores only UUID paths', async t => {
    const { storage, directory } = await fixture(t);
    const input = await sharp({ create: { width: 4, height: 2, channels: 3, background: '#3377aa' } })
      .jpeg().withMetadata({ orientation: 6 }).withExif({ IFD0: { Artist: 'Private metadata fixture' } }).toBuffer();
    assert.ok((await sharp(input).metadata()).exif);
    const prepared = await storage.prepare([{ originalname: '../../private-name.jpg', mimetype: 'image/jpeg', buffer: input }]);
    const output = await sharp(prepared[0]!.buffer).metadata();
    assert.equal(output.format, 'jpeg');
    assert.equal(output.exif, undefined);
    assert.equal(output.orientation, undefined);
    assert.equal(output.width, 2);
    assert.equal(output.height, 4);
    const saved = await storage.save(prepared);
    assert.equal(saved.images[0]!.exifRemoved, true);
    assert.match(saved.images[0]!.sha256, /^[a-f0-9]{64}$/);
    assert.match(saved.images[0]!.objectKey, /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/);
    assert.deepEqual(await readFile(join(directory, saved.images[0]!.objectKey)), prepared[0]!.buffer);
    await storage.remove(saved.directory);
    assert.deepEqual(await readdir(directory), []);
    await assert.rejects(storage.remove('../outside'), /Invalid evidence directory/);
  });

  it('rejects mismatched file types, corrupt images, animations, excessive counts and oversized input', async t => {
    const { storage } = await fixture(t);
    const valid = await photo();
    const animatedPng = Buffer.concat([valid.buffer.subarray(0, 33), Buffer.from([0, 0, 0, 8]), Buffer.from('acTL'), Buffer.alloc(12), valid.buffer.subarray(33)]);
    for (const files of [[], Array(4).fill(valid), [{ ...valid, originalname: 'image.jpg' }], [{ ...valid, mimetype: 'image/jpeg' }],
      [{ ...valid, buffer: valid.buffer.subarray(0, 35) }], [{ ...valid, buffer: animatedPng }],
      [{ originalname: 'image.svg', mimetype: 'image/svg+xml', buffer: Buffer.from('<svg/>') }],
    ]) await assert.rejects(storage.prepare(files), (error: unknown) => error instanceof ApiError && error.status === 400);
    await assert.rejects(storage.prepare([{ ...valid, buffer: Buffer.alloc(MAX_PHOTO_BYTES + 1) }]), (error: unknown) => error instanceof ApiError && error.status === 413);
  });
});

describe('Phase 4 submission idempotency and file cleanup', () => {
  it('replays an old report with unknown operator/device but rejects a new report with missing identifiers', async t => {
    const { config, service, repository, storage } = await fixture(t);
    const input = payload({ operator: null, deviceId: null, finalReportText: '이전 신고문', reportConfirmed: true });
    const files = [await photo()];
    const parsed = reportSubmissionSchema.parse(input);
    const photos = await storage.prepare(files);
    const facts = {
      submissionId: parsed.submissionId, operator: parsed.operator, deviceId: parsed.deviceId, qrRawData: parsed.qrRawData,
      latitude: parsed.latitude, longitude: parsed.longitude, address: parsed.address,
      categories: [...parsed.categories].sort(), additionalDescription: parsed.additionalDescription,
      finalReportText: parsed.finalReportText!,
    };
    const submissionHash = createHmac('sha256', lookupKey).update('parkick-submission-v1\0')
      .update(JSON.stringify({ facts, phoneIdentifier: null, photos: photos.map(photo => photo.sourceHash) })).digest('hex');
    const receipt = { publicId: 'PK-20261001-aabbccddeeff', status: 'RECEIVED' as const,
      createdAt: new Date().toISOString(), address: parsed.address,
      latitude: parsed.latitude, longitude: parsed.longitude, hasContact: false };
    repository.records.set(parsed.submissionId, { id: randomUUID(), submissionHash, receipt });
    const unavailableValidator: PhotoValidator = {
      mode: 'bedrock', configured: true,
      async validate() { throw new Error('A replay must not call Bedrock.'); },
    };
    const replayService = new ReportSubmissionService(config.reports!, repository, storage, unavailableValidator);
    assert.deepEqual(await replayService.submit(input, files), { receipt, replayed: true });
    await assert.rejects(service.submit({ ...input, submissionId: randomUUID() }, files),
      (error: unknown) => error instanceof ApiError && error.status === 400 && error.code === 'IDENTITY_REQUIRED');
    assert.equal(repository.inputs.length, 0);
  });

  it('stores one canonical operator name and replays code/name/alias submissions without another write', async t => {
    const { service, repository } = await fixture(t);
    const input = payload({ operator: 'kakao-bike' });
    const files = [await photo()];
    const first = await service.submit(input, files);
    for (const operator of ['카카오 T 바이크', '카카오바이크', ' KAKAO-BIKE ']) {
      const replay = await service.submit({ ...input, operator }, files);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.receipt, first.receipt);
    }
    assert.equal(repository.inputs.length, 1);
    assert.equal(repository.inputs[0]!.facts.operator, '카카오 T 바이크');
    assert.equal(repository.inputs[0]!.facts.finalReportText, '신고 유형: 보행로 통행 방해');
    await assert.rejects(service.submit({ ...input, operator: 'beam' }, files), (error: unknown) => error instanceof ApiError && error.status === 409);
  });

  it('accepts unchanged legacy text and pre-normalization retries while rejecting changed report facts or photos', async t => {
    const { service, repository, storage } = await fixture(t);
    const input = payload({ operator: 'kakao-bike' });
    const legacyInput = { ...input, finalReportText: '이전 화면에서 확인한 신고문', reportConfirmed: true };
    const files = [await photo()];
    const first = await service.submit(input, files);
    const saved = repository.inputs[0]!;
    const photos = await storage.prepare(files);
    const legacyHash = createHmac('sha256', lookupKey).update('parkick-submission-v1\0')
      .update(JSON.stringify({ facts: { ...saved.facts, operator: 'kakao-bike', finalReportText: legacyInput.finalReportText }, phoneIdentifier: null, photos: photos.map(photo => photo.sourceHash) })).digest('hex');
    repository.records.get(saved.facts.submissionId)!.submissionHash = legacyHash;
    const replay = await service.submit(legacyInput, files);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.receipt, first.receipt);
    assert.equal(repository.inputs.length, 1);
    for (const patch of [{ operator: 'beam' }, { categories: ['차도'] }, { deviceId: 'CHANGED' }]) {
      await assert.rejects(service.submit({ ...legacyInput, ...patch }, files), (error: unknown) => error instanceof ApiError && error.status === 409);
    }
    const changedPhoto = { ...files[0]!, buffer: await sharp(files[0]!.buffer).negate().png().toBuffer() };
    await assert.rejects(service.submit(legacyInput, [changedPhoto]), (error: unknown) => error instanceof ApiError && error.status === 409);
  });

  it('saves a safe receipt and absent contact; returns the same receipt on retries and rejects changed payload', async t => {
    const { service, repository, directory } = await fixture(t);
    const input = payload();
    const files = [await photo()];
    const first = await service.submit(input, files);
    const second = await service.submit(input, files);
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.deepEqual(first.receipt, second.receipt);
    assert.match(first.receipt.publicId, /^PK-\d{8}-[a-f0-9]{12}$/);
    assert.equal(first.receipt.hasContact, false);
    assert.equal(repository.inputs.length, 1);
    assert.deepEqual(Object.values(repository.inputs[0]!.contact), Array(7).fill(null));
    assert.equal(repository.inputs[0]!.regionCode, 'local-development');
    assert.equal(repository.inputs[0]!.facts.qrRawData, input.qrRawData);
    await assert.rejects(service.submit({ ...input, categories: ['차도'] }, files), (error: unknown) => error instanceof ApiError && error.status === 409);
    const changedPhoto = { ...files[0]!, buffer: await sharp(files[0]!.buffer).negate().png().toBuffer() };
    await assert.rejects(service.submit(input, [changedPhoto]), (error: unknown) => error instanceof ApiError && error.status === 409);
    assert.equal((await readdir(directory)).length, 1);
  });

  it('normalizes contact and category order for retries without leaking plaintext into persisted facts or receipts', async t => {
    const { service, repository } = await fixture(t);
    const input = payload({ phone: '010-1234-5678', consent: true, categories: ['차도', '횡단보도 주변'] });
    const files = [await photo()];
    const first = await service.submit(input, files);
    const second = await service.submit({ ...input, phone: '01012345678', categories: ['횡단보도 주변', '차도'] }, files);
    assert.equal(second.replayed, true);
    assert.equal(first.receipt.hasContact, true);
    assert.equal(JSON.stringify(repository.inputs[0]!.facts).includes('01012345678'), false);
    assert.equal(JSON.stringify(first.receipt).includes('01012345678'), false);
    assert.equal(JSON.stringify(first.receipt).includes('010-1234-5678'), false);
  });

  it('concurrent identical submissions create one record and remove only the losing attempt files', async t => {
    const { service, repository, directory } = await fixture(t);
    const input = payload();
    const files = [await photo()];
    const results = await Promise.all([service.submit(input, files), service.submit(input, files)]);
    assert.deepEqual(results[0]!.receipt, results[1]!.receipt);
    assert.equal(results.filter(result => !result.replayed).length, 1);
    assert.equal(repository.inputs.length, 1);
    assert.equal((await readdir(directory)).length, 1);
    assert.ok(await readFile(join(directory, repository.inputs[0]!.images[0]!.objectKey)));
  });

  it('fails closed before disk writes on DB read failure and cleans images after an uncommitted DB insert', async t => {
    const { service, repository, directory } = await fixture(t);
    const files = [await photo()];
    repository.failure = 'read';
    await assert.rejects(service.submit(payload(), files), (error: unknown) => error instanceof ApiError && error.status === 503);
    assert.deepEqual(await readdir(directory), []);
    repository.failure = 'create';
    await assert.rejects(service.submit(payload(), files), (error: unknown) => error instanceof ApiError && error.status === 503);
    assert.deepEqual(await readdir(directory), []);
  });

  it('reconciles a lost commit acknowledgement and preserves the committed report evidence', async t => {
    const { service, repository, directory } = await fixture(t);
    repository.failure = 'acknowledgement';
    const result = await service.submit(payload(), [await photo()]);
    assert.equal(result.replayed, true);
    assert.equal(repository.inputs.length, 1);
    assert.equal((await readdir(directory)).length, 1);
    assert.ok(await readFile(join(directory, repository.inputs[0]!.images[0]!.objectKey)));
  });
});

describe('Phase 4 report multipart API', () => {
  it('checks photos before advancing, rejects unrelated evidence at both endpoints, and does not save rejected photos', async t => {
    const { config, repository, directory } = await fixture(t);
    let verdict: 'valid' | 'unrelated' | 'unavailable' = 'valid';
    let calls = 0;
    const photoValidator: PhotoValidator = {
      mode: 'bedrock', configured: true,
      async validate() {
        calls += 1;
        if (verdict === 'unrelated') throw new ApiError(422, 'PHOTO_NOT_PM', '올바른 현장 사진을 다시 첨부해주세요.');
        if (verdict === 'unavailable') throw new ApiError(503, 'PHOTO_VALIDATION_UNAVAILABLE', '잠시 후 다시 시도해주세요.');
      },
    };
    const app = await createApp(config, { reportRepository: repository, photoValidator });
    t.after(() => app.closeResources());
    const file = await photo();
    const check = () => request(app).post('/api/reports/validate-photos').set('Origin', origin)
      .attach('photos', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    const submit = (body = payload()) => request(app).post('/api/reports').set('Origin', origin)
      .field('report', JSON.stringify(body)).attach('photos', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    assert.deepEqual((await check().expect(200)).body.data, { valid: true, photoValidation: 'bedrock' });
    assert.deepEqual(await readdir(directory), [], 'A preflight photo check must not persist evidence');
    await request(app).post('/api/reports/validate-photos').set('Origin', origin).field('report', '{}')
      .attach('photos', file.buffer, { filename: file.originalname, contentType: file.mimetype }).expect(400);
    verdict = 'unrelated';
    assert.equal((await check().expect(422)).body.error.code, 'PHOTO_NOT_PM');
    assert.equal((await submit().expect(422)).body.error.code, 'PHOTO_NOT_PM');
    assert.equal(repository.inputs.length, 0);
    assert.deepEqual(await readdir(directory), []);
    verdict = 'unavailable';
    assert.equal((await check().expect(503)).body.error.code, 'PHOTO_VALIDATION_UNAVAILABLE');
    assert.equal((await submit().expect(503)).body.error.code, 'PHOTO_VALIDATION_UNAVAILABLE');
    verdict = 'valid';
    for (const identity of [{ operator: null }, { operator: '   ' }, { operator: '업체 확인 불가' },
      { deviceId: null }, { deviceId: '  ' }, { deviceId: '기기번호 확인 불가' }]) {
      assert.equal((await submit(payload(identity)).expect(400)).body.error.code, 'IDENTITY_REQUIRED');
    }
    const input = payload();
    const created = await submit(input).expect(201);
    assert.equal(repository.inputs.length, 1);
    const previousCalls = calls;
    verdict = 'unavailable';
    assert.deepEqual((await submit(input).expect(200)).body, created.body);
    assert.equal(calls, previousCalls, 'An identical retry must not invoke Bedrock again');
  });

  it('keeps production intake available without Bedrock while validating image format and storing private files', async t => {
    const productionOrigin = 'https://parkick.example';
    const { config, repository, directory } = await fixture(t, {
      NODE_ENV: 'production', FRONTEND_ORIGIN: productionOrigin, REPORT_STORAGE_PROVIDER: 'local', TRUST_PROXY: 'loopback',
    });
    const app = await createApp(config, { reportRepository: repository });
    t.after(() => app.closeResources());
    const health = await request(app).get('/api/health').expect(200);
    assert.equal(health.body.data.mode, 'production');
    assert.equal(health.body.data.services.storage, 'private-local');
    assert.equal(health.body.data.services.photoValidation, 'disabled');
    assert.deepEqual((await request(app).get('/api/reports/status').expect(200)).body.data, { available: true, mode: 'local', photoValidation: 'disabled' });
    const file = await photo();
    assert.deepEqual((await request(app).post('/api/reports/validate-photos').set('Origin', productionOrigin)
      .attach('photos', file.buffer, { filename: file.originalname, contentType: file.mimetype }).expect(200)).body.data,
    { valid: true, photoValidation: 'disabled' });
    assert.deepEqual(await readdir(directory), [], 'A preflight format check must not persist evidence');
    const invalidFile = Buffer.from('This is not an image');
    const invalidCheck = await request(app).post('/api/reports/validate-photos').set('Origin', productionOrigin)
      .attach('photos', invalidFile, { filename: 'invalid.png', contentType: 'image/png' }).expect(400);
    assert.equal(invalidCheck.body.error.code, 'INVALID_PHOTO');
    const input = payload();
    const submit = (value = input, requestOrigin = productionOrigin) => request(app).post('/api/reports')
      .set('Origin', requestOrigin).field('report', JSON.stringify(value))
      .attach('photos', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    const created = await submit().expect(201);
    const invalidSubmit = await request(app).post('/api/reports').set('Origin', productionOrigin)
      .field('report', JSON.stringify(payload()))
      .attach('photos', invalidFile, { filename: 'invalid.png', contentType: 'image/png' }).expect(400);
    assert.equal(invalidSubmit.body.error.code, 'INVALID_PHOTO');
    assert.equal(created.body.data.status, 'RECEIVED');
    assert.deepEqual((await submit().expect(200)).body, created.body);
    assert.equal(repository.inputs.length, 1);
    const objectKey = repository.inputs[0]!.images[0]!.objectKey;
    const savedPhoto = await readFile(join(directory, objectKey));
    assert.equal((await sharp(savedPhoto).metadata()).format, 'jpeg');
    assert.equal((await sharp(savedPhoto).metadata()).exif, undefined);
    assert.equal(JSON.stringify(created.body).includes(objectKey), false);
    assert.equal(JSON.stringify(created.body).includes(directory), false);
    for (const path of [`/api/reports/${objectKey}`, `/data/reports/${objectKey}`, `/reports/${objectKey}`]) {
      await request(app).get(path).expect(404);
    }
    await submit(payload(), 'http://parkick.example').expect(403);
    repository.failure = 'create';
    await submit(payload()).expect(503);
    assert.deepEqual(await readdir(directory), [objectKey.split('/')[0]]);
    assert.deepEqual(await readFile(join(directory, objectKey)), savedPhoto);
  });

  it('reports disabled/unavailable honestly and never exposes a storage path or DB error', async t => {
    const disabled = await createApp(readConfig({ NODE_ENV: 'test' }));
    const status = await request(disabled).get('/api/reports/status').expect(200);
    assert.deepEqual(status.body.data, { available: false, mode: 'disabled', photoValidation: 'mock' });
    await request(disabled).post('/api/reports').set('Origin', origin).send({}).expect(503);
    const { config, repository } = await fixture(t);
    repository.available = false;
    const app = await createApp(config, { reportRepository: repository, photoValidator: allowPhotos });
    t.after(() => app.closeResources());
    assert.deepEqual((await request(app).get('/api/reports/status').expect(200)).body.data, { available: false, mode: 'local', photoValidation: 'mock' });
    repository.failure = 'read';
    const file = await photo();
    const failure = await request(app).post('/api/reports').set('Origin', origin).field('report', JSON.stringify(payload())).attach('photos', file.buffer, { filename: file.originalname, contentType: file.mimetype }).expect(503);
    assert.equal(failure.body.error.code, 'REPORT_UNAVAILABLE');
    assert.equal(JSON.stringify(failure.body).includes(config.reports!.databaseUrl), false);
    assert.equal(JSON.stringify(failure.body).includes(config.reports!.storageDir), false);
  });

  it('accepts multipart photos, returns only a public receipt, and replays with HTTP 200', async t => {
    const { config, repository } = await fixture(t);
    const app = await createApp(config, { reportRepository: repository, photoValidator: allowPhotos });
    t.after(() => app.closeResources());
    assert.deepEqual((await request(app).get('/api/reports/status').expect(200)).body.data, { available: true, mode: 'local', photoValidation: 'mock' });
    const file = await photo();
    const input = payload({ phone: '010-1234-5678', consent: true });
    const submit = () => request(app).post('/api/reports').set('Origin', origin).field('report', JSON.stringify(input))
      .attach('photos', file.buffer, { filename: file.originalname, contentType: file.mimetype })
      .attach('photos', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    const created = await submit().expect(201);
    assert.deepEqual(Object.keys(created.body.data).sort(), ['address', 'createdAt', 'hasContact', 'latitude', 'longitude', 'publicId', 'status']);
    assert.equal(created.body.data.status, 'RECEIVED');
    assert.equal(created.body.data.hasContact, true);
    assert.deepEqual((await submit().expect(200)).body, created.body);
    assert.equal(repository.inputs[0]!.images.length, 2);
    const objectKey = repository.inputs[0]!.images[0]!.objectKey;
    await request(app).get(`/api/reports/${objectKey}`).expect(404);
    await request(app).get(`/data/reports/${objectKey}`).expect(404);
  });

  it('validates payload, rejects forged ownership and preserves origin and JSON boundaries on other routes', async t => {
    const { config, repository } = await fixture(t);
    const app = await createApp(config, { reportRepository: repository, photoValidator: allowPhotos });
    t.after(() => app.closeResources());
    const file = await photo();
    const submit = (value: unknown) => request(app).post('/api/reports').set('Origin', origin).field('report', JSON.stringify(value)).attach('photos', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    await submit(payload({ tenantId: randomUUID() })).expect(400);
    await submit(payload({ phone: '01012345678', consent: false })).expect(400);
    await request(app).post('/api/reports').set('Origin', origin).field('report', '{').attach('photos', file.buffer, 'photo.png').expect(400);
    await request(app).post('/api/reports').set('Origin', origin).field('report', JSON.stringify(payload())).expect(400);
    await request(app).post('/api/reports').set('Origin', origin).field('report', JSON.stringify(payload())).field('tenantId', randomUUID()).attach('photos', file.buffer, 'photo.png').expect(400);
    await request(app).post('/api/reports').set('Origin', origin).send(payload()).expect(415);
    await request(app).post('/api/reports').field('report', JSON.stringify(payload())).expect(403);
    await request(app).post('/api/reports').set('Origin', 'https://evil.example').field('report', JSON.stringify(payload())).expect(403);
    for (const path of ['/api/ai/generate-report', '/api/qr/parse', '/api/admin/auth/login']) {
      await request(app).post(path).set('Origin', origin).field('report', '{}').expect(415);
    }
    assert.equal(repository.inputs.length, 0);
  });

  it('limits total file count, binary size and report field size before persistence', async t => {
    const { config, repository } = await fixture(t);
    const app = await createApp(config, { reportRepository: repository, photoValidator: allowPhotos });
    t.after(() => app.closeResources());
    const file = await photo();
    let excessive = request(app).post('/api/reports').set('Origin', origin).field('report', JSON.stringify(payload()));
    for (let index = 0; index < 3; index += 1) excessive = excessive.attach('photos', file.buffer, 'photo.png');
    const tooMany = await excessive.expect(400);
    assert.equal(tooMany.body.error.code, 'INVALID_MULTIPART');
    assert.match(tooMany.body.error.message, /1~2장/);
    const tooManyPreflight = await request(app).post('/api/reports/validate-photos').set('Origin', origin)
      .attach('photos', file.buffer, 'photo.png')
      .attach('photos', file.buffer, 'photo.png')
      .attach('photos', file.buffer, 'photo.png').expect(400);
    assert.equal(tooManyPreflight.body.error.code, 'INVALID_MULTIPART');
    await request(app).post('/api/reports').set('Origin', origin).field('report', JSON.stringify(payload())).attach('photos', Buffer.alloc(MAX_PHOTO_BYTES + 1), 'photo.png').expect(413);
    await request(app).post('/api/reports').set('Origin', origin).field('report', 'x'.repeat(65537)).attach('photos', file.buffer, 'photo.png').expect(413);
    assert.equal(repository.inputs.length, 0);
  });

  it('rate limits intake attempts without relying on user-supplied forwarded IPs', async () => {
    const app = await createApp(readConfig({ NODE_ENV: 'test' }));
    for (let index = 0; index < 10; index += 1) await request(app).post('/api/reports').set('Origin', origin).set('X-Forwarded-For', `198.51.100.${index}`).send({}).expect(503);
    await request(app).post('/api/reports').set('Origin', origin).send({}).expect(429);
  });
});
