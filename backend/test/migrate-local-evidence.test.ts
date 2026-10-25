import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import {
  MigrationError, PrismaMigrationDatabase, S3MigrationObjectStore, planMigration, runMigration,
  type ImageRow, type MigrationDatabase, type MigrationEntry, type MigrationObjectStore,
} from '../scripts/migrate-local-evidence.js';
import { LocalEvidenceStorage } from '../src/services/storage/LocalEvidenceStorage.js';

const BUCKET = 'parkick-test-images';
const PREFIX = 'reports';

function imageBytes(seed: number): Buffer { return Buffer.from([0xff, 0xd8, seed, seed + 1, 0xff, 0xd9]); }
function sha256(buffer: Buffer): string { return createHash('sha256').update(buffer).digest('hex'); }

class FakeDatabase implements MigrationDatabase {
  readonly events: string[] = [];
  constructor(readonly rows: ImageRow[]) {}
  async listImages(): Promise<ImageRow[]> { return this.rows.map(row => ({ ...row })); }
  async replaceKeys(entries: readonly MigrationEntry[], direction: 'forward' | 'backward'): Promise<void> {
    this.events.push('db');
    for (const entry of entries) {
      const row = this.rows.find(image => image.id === entry.id);
      const oldKey = direction === 'forward' ? entry.oldKey : entry.newKey;
      if (row?.objectKey !== oldKey) throw new MigrationError('CAS failed');
    }
    for (const entry of entries) {
      const row = this.rows.find(image => image.id === entry.id)!;
      row.objectKey = direction === 'forward' ? entry.newKey : entry.oldKey;
    }
  }
}

class FakeS3 implements MigrationObjectStore {
  readonly objects = new Map<string, Buffer>();
  readonly events: string[] = [];
  failOnPut = 0;
  corruptRead = false;
  async ensure(entry: MigrationEntry, buffer: Buffer): Promise<void> {
    this.events.push(`put:${entry.newKey}`);
    if (this.failOnPut === this.events.filter(event => event.startsWith('put:')).length) throw new MigrationError('S3 failed');
    const existing = this.objects.get(entry.newKey);
    if (!existing) this.objects.set(entry.newKey, Buffer.from(buffer));
    await this.verify(entry);
  }
  async verify(entry: MigrationEntry): Promise<void> {
    this.events.push(`get:${entry.newKey}`);
    const data = this.objects.get(entry.newKey);
    if (!data || this.corruptRead || data.length !== entry.sizeBytes || sha256(data) !== entry.sha256) {
      throw new MigrationError('S3 contents differ');
    }
  }
}

async function fixture(t: { after(fn: () => Promise<void>): void }, count = 2) {
  const root = await mkdtemp(join(tmpdir(), 'parkick-image-migration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = randomUUID();
  await mkdir(join(root, directory));
  const reportId = randomUUID();
  const rows: ImageRow[] = [];
  const buffers: Buffer[] = [];
  for (let index = 0; index < count; index++) {
    const buffer = imageBytes(index + 1);
    const file = `${randomUUID()}.jpg`;
    await writeFile(join(root, directory, file), buffer);
    buffers.push(buffer);
    rows.push({
      id: randomUUID(), reportId, objectKey: `${directory}/${file}`, mimeType: 'image/jpeg',
      sizeBytes: buffer.length, sha256: sha256(buffer), exifRemoved: true,
      createdAt: new Date(`2026-10-20T00:00:0${index}Z`),
    });
  }
  const database = new FakeDatabase(rows);
  const s3 = new FakeS3();
  const manifestPath = join(root, 'migration.json');
  const local = new LocalEvidenceStorage(root);
  const options = { bucket: BUCKET, prefix: PREFIX, localRoot: root, manifestPath, database, local, s3 };
  return { root, rows, buffers, database, s3, manifestPath, local, options };
}

describe('local evidence migration', () => {
  it('plans stable ordered S3 keys and rejects unknown or conflicting DB paths', async t => {
    const { rows } = await fixture(t);
    const planned = planMigration([...rows].reverse(), PREFIX);
    const directory = rows[0]!.objectKey.split('/')[0];
    assert.deepEqual(planned.map(entry => entry.newKey), [1, 2].map(index => `${PREFIX}/${directory}/${index}.jpg`));
    assert.deepEqual(planned.map(entry => entry.id), rows.map(row => row.id));
    assert.throws(() => planMigration([{ ...rows[0]!, objectKey: '../outside.jpg' }], PREFIX), MigrationError);
    assert.throws(() => planMigration([{ ...rows[0]!, sha256: null }], PREFIX), MigrationError);
    assert.throws(() => planMigration([...rows, { ...rows[0]!, id: randomUUID(), objectKey: planned[0]!.newKey }], PREFIX), MigrationError);
  });

  it('dry-runs without S3 or DB writes and checks the local file against the DB digest', async t => {
    const { options, rows, database, manifestPath } = await fixture(t);
    const result = await runMigration({ ...options, mode: 'dry-run', s3: undefined });
    assert.deepEqual(result, { images: 2, status: 'planned' });
    assert.deepEqual(database.events, []);
    await assert.rejects(readFile(manifestPath), { code: 'ENOENT' });
    rows[1]!.sha256 = '0'.repeat(64);
    await assert.rejects(runMigration({ ...options, mode: 'dry-run', s3: undefined }), /SHA-256/);
  });

  it('writes a recovery manifest, verifies all S3 bytes, then changes every DB key once', async t => {
    const { options, rows, buffers, database, s3, manifestPath, local } = await fixture(t);
    const originals = rows.map(row => row.objectKey);
    const result = await runMigration({ ...options, mode: 'apply' });
    assert.deepEqual(result, { images: 2, status: 'applied' });
    assert.equal(database.events.length, 1);
    assert.equal(s3.events.length, 4);
    assert.equal(rows.every(row => row.objectKey.startsWith('reports/')), true);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { images: MigrationEntry[] };
    assert.deepEqual(manifest.images.map(entry => entry.oldKey), originals);
    for (const [index, key] of originals.entries()) assert.deepEqual((await local.read(key)).buffer, buffers[index]);
    assert.deepEqual(await runMigration({ ...options, mode: 'verify' }), { images: 2, status: 'verified' });
    assert.deepEqual(await runMigration({ ...options, mode: 'apply' }), { images: 2, status: 'already-applied' });
    assert.deepEqual(database.events, ['db']);
  });

  it('leaves DB and originals intact after partial upload failure; retry reuses verified S3 objects', async t => {
    const { options, rows, database, s3, manifestPath, local } = await fixture(t);
    const originals = rows.map(row => row.objectKey);
    s3.failOnPut = 2;
    await assert.rejects(runMigration({ ...options, mode: 'apply' }), /S3 failed/);
    assert.deepEqual(rows.map(row => row.objectKey), originals);
    assert.deepEqual(database.events, []);
    assert.equal((JSON.parse(await readFile(manifestPath, 'utf8')) as { images: unknown[] }).images.length, 2);
    assert.equal(s3.objects.size, 1);
    s3.failOnPut = 0;
    assert.deepEqual(await runMigration({ ...options, mode: 'apply' }), { images: 2, status: 'applied' });
    for (const key of originals) await local.read(key);
  });

  it('refuses a changed S3 object and rolls back using verified originals without deleting uploads', async t => {
    const { options, rows, database, s3, local } = await fixture(t);
    const originals = rows.map(row => row.objectKey);
    const first = planMigration(rows, PREFIX)[0]!;
    s3.objects.set(first.newKey, imageBytes(99));
    await assert.rejects(runMigration({ ...options, mode: 'apply' }), /S3 contents differ/);
    assert.deepEqual(rows.map(row => row.objectKey), originals);
    assert.deepEqual(database.events, []);
    s3.objects.set(first.newKey, imageBytes(1));
    await runMigration({ ...options, mode: 'apply' });
    const objectCount = s3.objects.size;
    assert.deepEqual(await runMigration({ ...options, mode: 'rollback' }), { images: 2, status: 'rolled-back' });
    assert.deepEqual(rows.map(row => row.objectKey), originals);
    assert.equal(s3.objects.size, objectCount);
    assert.deepEqual(await runMigration({ ...options, mode: 'rollback' }), { images: 2, status: 'already-rolled-back' });
    for (const key of originals) await local.read(key);
  });

  it('uses conditional S3 writes and GET body verification without bucket listing', async () => {
    const bytes = imageBytes(5);
    const directory = randomUUID();
    const entry: MigrationEntry = {
      id: randomUUID(), reportId: randomUUID(), oldKey: `${directory}/${randomUUID()}.jpg`,
      newKey: `${PREFIX}/${directory}/1.jpg`, sizeBytes: bytes.length, sha256: sha256(bytes),
    };
    const commands: Array<PutObjectCommand | GetObjectCommand> = [];
    const client = {
      async send(command: PutObjectCommand | GetObjectCommand) {
        commands.push(command);
        if (command instanceof PutObjectCommand) throw { $metadata: { httpStatusCode: 412 } };
        return { ContentLength: bytes.length, Body: { transformToByteArray: async () => bytes } };
      },
      destroy() {},
    } as unknown as S3Client;
    const storage = new S3MigrationObjectStore(BUCKET, 'ap-northeast-2', client);
    await storage.ensure(entry, bytes);
    assert.equal(commands.length, 2);
    assert.ok(commands[0] instanceof PutObjectCommand);
    assert.equal(commands[0].input.IfNoneMatch, '*');
    assert.equal(commands[0].input.ChecksumSHA256, Buffer.from(entry.sha256, 'hex').toString('base64'));
    assert.equal(commands[0].input.ServerSideEncryption, 'AES256');
    assert.ok(commands[1] instanceof GetObjectCommand);
    assert.equal(commands[1].input.Key, entry.newKey);
    storage.close();
  });

  it('rechecks the full legacy set inside a serializable transaction and aborts on a new row', async t => {
    const { rows } = await fixture(t, 1);
    const entries = planMigration(rows, PREFIX);
    const later = { ...rows[0]!, id: randomUUID(), objectKey: `${randomUUID()}/${randomUUID()}.jpg` };
    const databaseRows = [...rows.map(row => ({ id: row.id, objectKey: row.objectKey })), { id: later.id, objectKey: later.objectKey }];
    let updates = 0;
    let isolation: unknown;
    const client = {
      async $transaction(fn: (transaction: unknown) => Promise<unknown>, settings: { isolationLevel: string }) {
        isolation = settings.isolationLevel;
        return fn({ reportImage: {
          findMany: async () => databaseRows,
          updateMany: async () => { updates++; return { count: 1 }; },
        } });
      },
    } as never;
    await assert.rejects(new PrismaMigrationDatabase(client).replaceKeys(entries, 'forward', PREFIX), /목록이 바뀌었습니다/);
    assert.equal(isolation, 'Serializable');
    assert.equal(updates, 0);
  });
});
