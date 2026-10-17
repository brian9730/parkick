import { randomUUID } from 'node:crypto';
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApiError } from '../../middleware/errors.js';
import type { EvidenceStorage, PreparedEvidence, SavedEvidence, StoredEvidence } from './EvidenceStorage.js';
import { prepareEvidence } from './prepareEvidence.js';

export interface S3EvidenceStorageOptions {
  region: string;
  bucket: string;
  prefix?: string;
  timeoutMs?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function unavailable(): ApiError {
  return new ApiError(503, 'STORAGE_UNAVAILABLE', '사진을 보관하지 못했습니다. 잠시 후 다시 시도해주세요.');
}

/** Server uploads only normalized evidence; bucket policy and Public Access Block keep it private. */
export class S3EvidenceStorage implements EvidenceStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly timeoutMs: number;
  readonly prepare = prepareEvidence;

  constructor(options: S3EvidenceStorageOptions, client?: S3Client) {
    this.bucket = options.bucket;
    this.prefix = options.prefix ?? 'reports';
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!options.region.trim() || !this.bucket.trim()) throw new Error('S3 region and bucket are required');
    if (this.prefix.length > 256 || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(this.prefix)) throw new Error('Invalid evidence S3 prefix');
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 30_000) throw new Error('Invalid evidence S3 timeout');
    // Default AWS credential chain supports local profiles and EC2 instance roles without embedded credentials.
    this.client = client ?? new S3Client({ region: options.region, maxAttempts: 2 });
  }

  async save(prepared: readonly PreparedEvidence[]): Promise<SavedEvidence> {
    if (prepared.length < 1 || prepared.length > 3) throw new ApiError(400, 'INVALID_PHOTOS', '현장 사진을 1~3장 첨부해주세요.');
    const directory = randomUUID();
    const keys = this.attemptKeys(directory);
    const images: StoredEvidence[] = [];
    // Share the HTTP abort deadline across this attempt and SDK retries.
    // Credential resolution uses the standard AWS provider chain's own timeouts.
    const abortSignal = AbortSignal.timeout(this.timeoutMs);
    try {
      for (const [index, photo] of prepared.entries()) {
        const objectKey = keys[index]!;
        await this.client.send(new PutObjectCommand({
          Bucket: this.bucket, Key: objectKey, Body: photo.buffer, ContentType: 'image/jpeg',
          ContentLength: photo.buffer.length, ChecksumSHA256: Buffer.from(photo.sha256, 'hex').toString('base64'),
          ServerSideEncryption: 'AES256', CacheControl: 'private, max-age=60',
        }), { abortSignal });
        images.push({ objectKey, mimeType: 'image/jpeg', sizeBytes: photo.buffer.length, sha256: photo.sha256, exifRemoved: true });
      }
      return { directory, images };
    } catch {
      // An unsuccessful Put may have stored its object before its response was lost.
      // Delete all possible keys belonging to this attempt, not only acknowledged uploads.
      await this.remove(directory);
      throw unavailable();
    }
  }

  async remove(directory: string): Promise<void> {
    const keys = this.attemptKeys(directory);
    try {
      const result = await this.client.send(new DeleteObjectsCommand({
        Bucket: this.bucket, Delete: { Objects: keys.map(Key => ({ Key })), Quiet: true },
      }), { abortSignal: AbortSignal.timeout(this.timeoutMs) });
      if (result.Errors?.length) throw new Error('Incomplete evidence cleanup');
    } catch {
      // Never disclose bucket paths, uploaded data, credentials or raw SDK error details.
      console.error(JSON.stringify({ event: 'evidence_cleanup_failed', storage: 's3' }));
    }
  }

  /** Internal helper: callers must authorize the report before requesting a URL. No public route exposes it. */
  async getReadUrl(objectKey: string, expiresInSeconds = 60): Promise<string> {
    const relative = objectKey.startsWith(`${this.prefix}/`) ? objectKey.slice(this.prefix.length + 1) : '';
    const [directory, file, extra] = relative.split('/');
    if (!directory || !UUID.test(directory) || !/^[123]\.jpg$/.test(file ?? '') || extra !== undefined) throw new Error('Invalid evidence object key');
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 300) throw new Error('Invalid evidence URL lifetime');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }), { expiresIn: expiresInSeconds }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Evidence URL timeout')), this.timeoutMs); }),
      ]);
    } catch {
      throw new ApiError(503, 'STORAGE_UNAVAILABLE', '사진을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally { clearTimeout(timeout); }
  }

  async read(objectKey: string): Promise<{ redirect: string }> {
    return { redirect: await this.getReadUrl(objectKey, 60) };
  }

  close(): void { this.client.destroy(); }

  private attemptKeys(directory: string): string[] {
    if (!UUID.test(directory)) throw new Error('Invalid evidence directory');
    return [1, 2, 3].map(index => `${this.prefix}/${directory}/${index}.jpg`);
  }
}
