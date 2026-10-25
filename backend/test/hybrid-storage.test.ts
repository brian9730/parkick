import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { assertProductionReportConfig, readConfig } from '../src/config.js';
import { ApiError } from '../src/middleware/errors.js';
import type { EvidenceStorage, SavedEvidence } from '../src/services/storage/EvidenceStorage.js';
import { HybridEvidenceStorage } from '../src/services/storage/HybridEvidenceStorage.js';
import { LocalEvidenceStorage } from '../src/services/storage/LocalEvidenceStorage.js';

function s3Fixture() {
  const directory = randomUUID();
  const key = `reports/${directory}/1.jpg`;
  const saved: SavedEvidence = { directory, images: [{ objectKey: key, mimeType: 'image/jpeg', sizeBytes: 4, sha256: 'a'.repeat(64), exifRemoved: true }] };
  const calls = { prepare: 0, save: 0, remove: [] as string[], read: [] as string[], close: 0 };
  const storage: EvidenceStorage & { read(objectKey: string): Promise<{ redirect: string }> } = {
    async prepare() { calls.prepare++; return [{ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), sourceHash: 'source', sha256: 'a'.repeat(64) }]; },
    async save() { calls.save++; return saved; },
    async remove(value) { calls.remove.push(value); },
    async read(value) { calls.read.push(value); return { redirect: 'https://s3.example/private' }; },
    close() { calls.close++; },
  };
  return { storage, calls, saved, key };
}

describe('S3 writes with legacy local evidence reads', () => {
  it('reads strict legacy keys from the configured directory and delegates all writes to S3', async t => {
    const root = await mkdtemp(join(tmpdir(), 'parkick-legacy-evidence-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const directory = randomUUID();
    const filename = `${randomUUID()}.jpg`;
    const oldKey = `${directory}/${filename}`;
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#336699' } }).jpeg().toBuffer();
    await mkdir(join(root, directory));
    await writeFile(join(root, directory, filename), jpeg);

    const s3 = s3Fixture();
    const storage = new HybridEvidenceStorage(s3.storage, 'reports', new LocalEvidenceStorage(root));
    assert.deepEqual(await storage.read(oldKey), { buffer: jpeg });
    assert.deepEqual(await storage.read(s3.key), { redirect: 'https://s3.example/private' });
    const prepared = await storage.prepare([]);
    assert.equal(prepared.length, 1);
    assert.deepEqual(await storage.save(prepared), s3.saved);
    await storage.remove(s3.saved.directory);
    storage.close();
    assert.deepEqual(s3.calls, { prepare: 1, save: 1, remove: [s3.saved.directory], read: [s3.key], close: 1 });
    assert.deepEqual(await new LocalEvidenceStorage(root).read(oldKey), { buffer: jpeg });
  });

  it('rejects malformed paths before either backend is called and reports unavailable legacy storage', async () => {
    const s3 = s3Fixture();
    const storage = new HybridEvidenceStorage(s3.storage, 'reports');
    const uuid = randomUUID();
    for (const key of [
      `../${uuid}.jpg`, `${uuid}/1.jpg`, `${uuid}/${uuid}.png`,
      `reports/${uuid}/4.jpg`, `reports/${uuid}/1.jpg/extra`, `reports-other/${uuid}/1.jpg`,
    ]) {
      await assert.rejects(storage.read(key), (error: unknown) => error instanceof ApiError && error.status === 404);
    }
    await assert.rejects(storage.read(`${uuid}/${randomUUID()}.jpg`),
      (error: unknown) => error instanceof ApiError && error.status === 503 && error.code === 'STORAGE_UNAVAILABLE');
    assert.deepEqual(s3.calls.read, []);
  });

  it('closes the legacy reader even if the S3 client close fails', () => {
    const s3 = s3Fixture();
    let legacyClosed = false;
    s3.storage.close = () => { throw new Error('S3 close failed'); };
    const storage = new HybridEvidenceStorage(s3.storage, 'reports', {
      async read() { return { buffer: Buffer.alloc(4) }; },
      close() { legacyClosed = true; },
    });
    assert.throws(() => storage.close(), /S3 close failed/);
    assert.equal(legacyClosed, true);
  });

  it('enables legacy reads only for an explicitly configured absolute directory', () => {
    const environment = {
      NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://parkick.example',
      DATABASE_URL: 'postgresql://test:password@127.0.0.1:5432/unused',
      REPORT_STORAGE_PROVIDER: 's3', AWS_REGION: 'ap-northeast-2', S3_REPORT_BUCKET: 'parkick-example',
      PHONE_ENCRYPTION_KEY: randomBytes(32).toString('base64'), PHONE_LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
    };
    assert.equal(readConfig(environment).reports?.legacyStorageDir, undefined);
    assert.throws(() => readConfig({ ...environment, REPORT_STORAGE_DIR: 'data/reports' }), /REPORT_STORAGE_DIR/);
    const absolute = resolve('data/reports');
    const configured = readConfig({ ...environment, REPORT_STORAGE_DIR: absolute });
    assert.equal(configured.reports?.legacyStorageDir, absolute);
    assert.throws(() => assertProductionReportConfig({ ...configured, reports: { ...configured.reports!, legacyStorageDir: 'data/reports' } }), /REPORT_STORAGE_DIR/);
  });
});
