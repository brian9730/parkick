import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { ApiError } from '../src/middleware/errors.js';
import { S3EvidenceStorage } from '../src/services/storage/S3EvidenceStorage.js';

type StorageCommand = PutObjectCommand | DeleteObjectsCommand;
function fixture(handler: (command: StorageCommand, signal: AbortSignal) => Promise<unknown> = async () => ({}), timeoutMs = 15_000) {
  const commands: StorageCommand[] = [];
  let closed = false;
  const client = {
    send: async (command: StorageCommand, options: { abortSignal: AbortSignal }) => {
      commands.push(command);
      return handler(command, options.abortSignal);
    },
    destroy: () => { closed = true; },
  } as unknown as S3Client;
  return {
    storage: new S3EvidenceStorage({ region: 'ap-northeast-2', bucket: 'parkick-test-evidence', timeoutMs }, client),
    commands,
    isClosed: () => closed,
  };
}

async function photo() {
  return {
    originalname: '../../private-original.jpg', mimetype: 'image/jpeg',
    buffer: await sharp({ create: { width: 4, height: 2, channels: 3, background: '#1268ab' } })
      .jpeg().withMetadata({ orientation: 6 }).withExif({ IFD0: { Artist: 'private source metadata' } }).toBuffer(),
  };
}

describe('private S3 evidence storage', () => {
  it('uploads decoded metadata-free JPEGs with encryption and only attempt-scoped keys', async () => {
    const { storage, commands, isClosed } = fixture();
    const source = await photo();
    const prepared = await storage.prepare([source]);
    const first = await storage.save(prepared);
    const second = await storage.save(prepared);
    assert.notEqual(first.directory, second.directory);
    assert.equal(first.images[0]!.objectKey, `reports/${first.directory}/1.jpg`);
    assert.equal(first.images[0]!.exifRemoved, true);
    const put = commands[0];
    assert.ok(put instanceof PutObjectCommand);
    assert.equal(put.input.Bucket, 'parkick-test-evidence');
    assert.equal(put.input.Key, first.images[0]!.objectKey);
    assert.equal(put.input.ContentType, 'image/jpeg');
    assert.equal(put.input.ContentLength, prepared[0]!.buffer.length);
    assert.equal(put.input.ServerSideEncryption, 'AES256');
    assert.equal(put.input.ACL, undefined);
    assert.equal(put.input.ChecksumSHA256, Buffer.from(prepared[0]!.sha256, 'hex').toString('base64'));
    assert.deepEqual(put.input.Body, prepared[0]!.buffer);
    const metadata = await sharp(prepared[0]!.buffer).metadata();
    assert.equal(metadata.format, 'jpeg');
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.orientation, undefined);
    assert.equal(metadata.width, 2);
    assert.equal(metadata.height, 4);
    await storage.remove(first.directory);
    const deletion = commands[2];
    assert.ok(deletion instanceof DeleteObjectsCommand);
    assert.deepEqual(deletion.input.Delete?.Objects?.map(object => object.Key), [1, 2, 3].map(index => `reports/${first.directory}/${index}.jpg`));
    assert.equal(JSON.stringify(deletion.input).includes(second.directory), false);
    assert.equal(JSON.stringify(first).includes('private-original'), false);
    storage.close();
    assert.equal(isClosed(), true);
  });

  it('rejects corrupt input and invalid cleanup paths without an AWS request', async () => {
    const { storage, commands } = fixture();
    const source = await photo();
    await assert.rejects(storage.prepare([{ ...source, buffer: source.buffer.subarray(0, 25) }]), (error: unknown) => error instanceof ApiError && error.status === 400);
    await assert.rejects(storage.save([]), (error: unknown) => error instanceof ApiError && error.status === 400);
    await assert.rejects(storage.remove('../outside'), /Invalid evidence directory/);
    await assert.rejects(storage.remove('reports'), /Invalid evidence directory/);
    assert.equal(commands.length, 0);
  });

  it('cleans every possible attempt key after a partial or ambiguous upload failure', async () => {
    let puts = 0;
    const { storage, commands } = fixture(async command => {
      if (command instanceof PutObjectCommand && ++puts === 2) throw new Error('Raw AWS failure with private bucket information');
      return {};
    });
    const source = await photo();
    const prepared = await storage.prepare([source, source, source]);
    await assert.rejects(storage.save(prepared), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 503);
      assert.equal(error.message.includes('private bucket'), false);
      return true;
    });
    assert.equal(commands.length, 3);
    const first = commands[0];
    const second = commands[1];
    const deletion = commands[2];
    assert.ok(first instanceof PutObjectCommand && second instanceof PutObjectCommand && deletion instanceof DeleteObjectsCommand);
    const keys = deletion.input.Delete?.Objects?.map(object => object.Key);
    assert.deepEqual(keys, [first.input.Key, second.input.Key, first.input.Key!.replace('/1.jpg', '/3.jpg')]);
  });

  it('bounds the upload attempt and cleans keys when a request is aborted', async () => {
    const { storage, commands } = fixture(async (command, signal) => {
      if (command instanceof PutObjectCommand) {
        await new Promise<void>((_, reject) => {
          const timer = setTimeout(() => reject(new Error('Test request exceeded deadline')), 500);
          signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
        });
      }
      return {};
    }, 20);
    const prepared = await storage.prepare([await photo()]);
    await assert.rejects(storage.save(prepared), (error: unknown) => error instanceof ApiError && error.status === 503);
    assert.equal(commands.length, 2);
    assert.ok(commands[1] instanceof DeleteObjectsCommand);
  });

  it('records sanitized cleanup failures for S3 partial-delete responses', async t => {
    const errors: string[] = [];
    t.mock.method(console, 'error', (message: string) => { errors.push(message); });
    const { storage } = fixture(async command => command instanceof DeleteObjectsCommand
      ? { Errors: [{ Key: 'private-bucket-key', Code: 'AccessDenied', Message: 'Sensitive SDK detail' }] } : {});
    await storage.remove(randomUUID());
    assert.deepEqual(errors, [JSON.stringify({ event: 'evidence_cleanup_failed', storage: 's3' })]);
  });

  it('signs only valid evidence keys for at most five minutes without a public route', async () => {
    const client = new S3Client({
      region: 'ap-northeast-2', credentials: { accessKeyId: 'TESTACCESSKEY', secretAccessKey: 'test-only-secret' },
    });
    const storage = new S3EvidenceStorage({ region: 'ap-northeast-2', bucket: 'parkick-test-evidence', prefix: 'reports/pilot' }, client);
    try {
      const key = `reports/pilot/${randomUUID()}/1.jpg`;
      const url = new URL(await storage.getReadUrl(key, 120));
      assert.equal(url.protocol, 'https:');
      assert.equal(url.hostname, 'parkick-test-evidence.s3.ap-northeast-2.amazonaws.com');
      assert.equal(url.pathname, `/${key}`);
      assert.equal(url.searchParams.get('X-Amz-Expires'), '120');
      await assert.rejects(storage.getReadUrl(key, 301), /lifetime/);
      await assert.rejects(storage.getReadUrl(key, 0), /lifetime/);
      await assert.rejects(storage.getReadUrl(key.replace('reports/pilot', 'outside')), /object key/);
      await assert.rejects(storage.getReadUrl(`${key}/extra`), /object key/);
    } finally { storage.close(); }
  });
});
