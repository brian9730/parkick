import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { ReportRepositoryError } from '../src/repositories/ReportRepository.js';
import type { NewReport, ReportRepository, StoredReport } from '../src/repositories/ReportRepository.js';
import { S3EvidenceStorage } from '../src/services/storage/S3EvidenceStorage.js';

class TestRepository implements ReportRepository {
  readonly rows = new Map<string, StoredReport>();
  readonly inputs: NewReport[] = [];
  failCreate = false;
  closed = false;
  async isAvailable(): Promise<boolean> { return true; }
  async findBySubmissionId(id: string): Promise<StoredReport | null> { return this.rows.get(id) ?? null; }
  async create(report: NewReport): Promise<StoredReport> {
    if (this.failCreate) throw new ReportRepositoryError('unavailable');
    const stored: StoredReport = {
      id: report.id, submissionHash: report.submissionHash,
      receipt: {
        publicId: report.publicId, status: 'RECEIVED', createdAt: report.createdAt.toISOString(),
        latitude: report.facts.latitude, longitude: report.facts.longitude, address: report.facts.address,
        hasContact: report.contact.phoneIdentifier !== null,
      },
    };
    this.rows.set(report.facts.submissionId, stored);
    this.inputs.push(report);
    return stored;
  }
  async close(): Promise<void> { this.closed = true; }
}

it('production multipart intake uses S3 evidence, replays safely and removes only an uncommitted attempt (AWS SDK double)', async t => {
  const origin = 'https://parkick.example.test';
  const config = readConfig({
    NODE_ENV: 'production', FRONTEND_ORIGIN: origin, ENABLE_DEV_ADMIN: 'false', AI_PROVIDER: 'disabled',
    DATABASE_URL: 'postgresql://test_user:test_password@127.0.0.1:1/unused',
    PHONE_ENCRYPTION_KEY: randomBytes(32).toString('base64'), PHONE_LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
    REPORT_STORAGE_PROVIDER: 's3', AWS_REGION: 'ap-northeast-2', S3_REPORT_BUCKET: 'parkick-test-evidence',
    S3_REPORT_PREFIX: 'reports', REPORT_REGION_CODE: 'test-seoul',
  });
  const s3 = config.reports!.storage!;
  assert.equal(s3.mode, 's3');
  if (s3.mode !== 's3') throw new Error('Expected S3 test configuration');
  const objects = new Map<string, Buffer>();
  const commands: (PutObjectCommand | DeleteObjectsCommand)[] = [];
  let storageClosed = false;
  const client = {
    send: async (command: PutObjectCommand | DeleteObjectsCommand) => {
      commands.push(command);
      if (command instanceof PutObjectCommand) {
        assert.ok(Buffer.isBuffer(command.input.Body));
        objects.set(command.input.Key!, command.input.Body);
      } else {
        for (const object of command.input.Delete!.Objects!) objects.delete(object.Key!);
      }
      return {};
    },
    destroy: () => { storageClosed = true; },
  } as unknown as S3Client;
  const repository = new TestRepository();
  const app = await createApp(config, { reportRepository: repository, reportStorage: new S3EvidenceStorage(s3, client) });
  t.after(async () => {
    await app.closeResources();
    assert.equal(repository.closed, true);
    assert.equal(storageClosed, true);
  });
  assert.deepEqual((await request(app).get('/api/reports/status').expect(200)).body.data, { available: true, mode: 's3', photoValidation: 'disabled' });
  assert.equal((await request(app).get('/api/health').expect(200)).body.data.services.storage, 'private-s3');
  const photo = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#12ab45' } }).png().toBuffer();
  const payload = {
    submissionId: randomUUID(), operator: '신고 테스트 업체', deviceId: 'TEST-S3', qrRawData: null,
    latitude: 37.5665, longitude: 126.9780, address: '테스트 공원', categories: ['보행로 통행 방해'],
    additionalDescription: '', phone: null, consent: false,
  };
  const submit = (input = payload) => request(app).post('/api/reports').set('Origin', origin)
    .field('report', JSON.stringify(input)).attach('photos', photo, { filename: 'private-source.png', contentType: 'image/png' });
  const created = await submit().expect(201);
  const receipt = created.body.data;
  assert.deepEqual(Object.keys(receipt).sort(), ['address', 'createdAt', 'hasContact', 'latitude', 'longitude', 'publicId', 'status']);
  assert.equal(receipt.hasContact, false);
  assert.equal(repository.inputs[0]!.regionCode, 'test-seoul');
  const committedKey = repository.inputs[0]!.images[0]!.objectKey;
  assert.match(committedKey, /^reports\/[0-9a-f-]{36}\/1\.jpg$/);
  assert.equal(objects.size, 1);
  assert.equal((await sharp(objects.get(committedKey)!).metadata()).format, 'jpeg');
  assert.equal(JSON.stringify(receipt).includes('parkick-test-evidence'), false);
  assert.equal(JSON.stringify(receipt).includes(committedKey), false);
  assert.deepEqual((await submit().expect(200)).body.data, receipt);
  assert.equal(commands.length, 1, 'A replay must not upload a second S3 object');
  assert.equal(repository.inputs.length, 1);
  await request(app).get(`/api/reports/${committedKey}`).expect(404);
  repository.failCreate = true;
  const failed = await submit({ ...payload, submissionId: randomUUID() }).expect(503);
  assert.equal(failed.body.error.code, 'REPORT_UNAVAILABLE');
  assert.equal(commands.length, 3);
  assert.ok(commands[1] instanceof PutObjectCommand);
  assert.ok(commands[2] instanceof DeleteObjectsCommand);
  assert.equal(objects.size, 1);
  assert.ok(objects.has(committedKey), 'Cleanup must retain the earlier committed report photo');
  assert.equal(commands[2].input.Delete!.Objects!.some(object => object.Key === committedKey), false);
});
