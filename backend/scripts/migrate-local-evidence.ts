import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config as loadEnvironment } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { LocalEvidenceStorage } from '../src/services/storage/LocalEvidenceStorage.js';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const LEGACY_KEY = new RegExp(`^(${UUID})/${UUID}\\.jpg$`);
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_EVIDENCE_BYTES = 32 * 1024 * 1024;

export type MigrationMode = 'dry-run' | 'apply' | 'verify' | 'rollback';
export interface ImageRow {
  id: string;
  reportId: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  exifRemoved: boolean;
  createdAt: Date;
}
export interface MigrationEntry {
  id: string;
  reportId: string;
  oldKey: string;
  newKey: string;
  sizeBytes: number;
  sha256: string;
}
export interface MigrationManifest {
  version: 1;
  createdAt: string;
  bucket: string;
  prefix: string;
  localRoot: string;
  images: MigrationEntry[];
}
export interface MigrationDatabase {
  listImages(): Promise<ImageRow[]>;
  replaceKeys(entries: readonly MigrationEntry[], direction: 'forward' | 'backward', prefix: string): Promise<void>;
}
export interface MigrationObjectStore {
  ensure(entry: MigrationEntry, buffer: Buffer): Promise<void>;
  verify(entry: MigrationEntry): Promise<void>;
  close?(): void;
}
export interface MigrationLocalStore { read(objectKey: string): Promise<{ buffer: Buffer }> }
export interface MigrationOptions {
  mode: MigrationMode;
  bucket: string;
  prefix: string;
  localRoot: string;
  manifestPath?: string;
  database: MigrationDatabase;
  local: MigrationLocalStore;
  s3?: MigrationObjectStore;
}
export interface MigrationResult { images: number; status: 'planned' | 'applied' | 'already-applied' | 'verified' | 'rolled-back' | 'already-rolled-back' }

export class MigrationError extends Error {}

function s3KeyPattern(prefix: string): RegExp {
  if (prefix.length > 256 || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix)) throw new MigrationError('S3_REPORT_PREFIX 형식을 확인하세요.');
  return new RegExp(`^${prefix}/${UUID}/[123]\\.jpg$`);
}

/** The legacy save directory is already a UUID. Reusing it makes S3 keys stable across retries. */
export function planMigration(rows: readonly ImageRow[], prefix: string): MigrationEntry[] {
  const s3Key = s3KeyPattern(prefix);
  const groups = new Map<string, ImageRow[]>();
  const existingKeys = new Set(rows.map(row => row.objectKey));
  for (const row of rows) {
    const directory = LEGACY_KEY.exec(row.objectKey)?.[1];
    if (!directory) {
      if (!s3Key.test(row.objectKey)) throw new MigrationError('DB에 인식할 수 없는 사진 경로가 있습니다.');
      continue;
    }
    if (!SHA256.test(row.sha256 ?? '') || row.mimeType !== 'image/jpeg' || !row.exifRemoved
      || !Number.isInteger(row.sizeBytes) || row.sizeBytes < 4 || row.sizeBytes > MAX_EVIDENCE_BYTES) {
      throw new MigrationError('기존 사진의 DB 크기·해시·형식 정보가 이관 조건과 다릅니다.');
    }
    const group = groups.get(directory) ?? [];
    group.push(row);
    groups.set(directory, group);
  }
  const entries: MigrationEntry[] = [];
  for (const [directory, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length > 3 || new Set(group.map(row => row.reportId)).size !== 1) {
      throw new MigrationError('기존 사진 디렉터리의 신고 연결 또는 사진 수가 예상과 다릅니다.');
    }
    group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    for (const [index, row] of group.entries()) {
      const newKey = `${prefix}/${directory}/${index + 1}.jpg`;
      if (existingKeys.has(newKey)) throw new MigrationError('이관 대상 S3 경로가 이미 다른 DB 사진에 사용 중입니다.');
      entries.push({ id: row.id, reportId: row.reportId, oldKey: row.objectKey, newKey, sizeBytes: row.sizeBytes, sha256: row.sha256! });
    }
  }
  return entries;
}

function validateManifest(value: unknown, bucket: string, prefix: string, localRoot: string): MigrationManifest {
  if (!value || typeof value !== 'object') throw new MigrationError('이관 기록 파일 형식이 올바르지 않습니다.');
  const manifest = value as Partial<MigrationManifest>;
  if (manifest.version !== 1 || manifest.bucket !== bucket || manifest.prefix !== prefix || manifest.localRoot !== localRoot
    || !Array.isArray(manifest.images) || !manifest.images.length || typeof manifest.createdAt !== 'string') {
    throw new MigrationError('이관 기록 파일이 현재 버킷·경로·형식과 일치하지 않습니다.');
  }
  const s3Key = s3KeyPattern(prefix);
  const ids = new Set<string>();
  const targets = new Set<string>();
  for (const image of manifest.images) {
    if (!image || typeof image !== 'object' || typeof image.id !== 'string' || typeof image.reportId !== 'string'
      || typeof image.oldKey !== 'string' || typeof image.newKey !== 'string' || !LEGACY_KEY.test(image.oldKey)
      || !s3Key.test(image.newKey) || image.newKey.split('/').at(-2) !== image.oldKey.split('/')[0]
      || !SHA256.test(image.sha256) || !Number.isInteger(image.sizeBytes) || image.sizeBytes < 4 || image.sizeBytes > MAX_EVIDENCE_BYTES
      || ids.has(image.id) || targets.has(image.newKey)) throw new MigrationError('이관 기록 파일의 사진 항목이 올바르지 않습니다.');
    ids.add(image.id);
    targets.add(image.newKey);
  }
  return manifest as MigrationManifest;
}

async function loadManifest(path: string, bucket: string, prefix: string, localRoot: string): Promise<MigrationManifest | null> {
  try { return validateManifest(JSON.parse(await readFile(path, 'utf8')) as unknown, bucket, prefix, localRoot); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    if (error instanceof MigrationError) throw error;
    throw new MigrationError('이관 기록 파일을 읽지 못했습니다.');
  }
}

async function saveManifest(path: string, manifest: MigrationManifest): Promise<void> {
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await handle.sync();
    // The DB update must never outlive its recovery manifest after a host crash.
    if (process.platform !== 'win32') {
      const directory = await open(dirname(path), 'r');
      try { await directory.sync(); }
      finally { await directory.close(); }
    }
  } catch {
    throw new MigrationError('이관 기록 파일을 만들지 못했습니다. 새 경로와 쓰기 권한을 확인하세요.');
  } finally { await handle?.close(); }
}

function stateForManifest(rows: readonly ImageRow[], images: readonly MigrationEntry[]): 'old' | 'new' {
  const byId = new Map(rows.map(row => [row.id, row]));
  let old = 0;
  let migrated = 0;
  for (const image of images) {
    const row = byId.get(image.id);
    if (!row || row.reportId !== image.reportId || row.sizeBytes !== image.sizeBytes || row.sha256 !== image.sha256) {
      throw new MigrationError('이관 기록과 현재 DB 사진 정보가 일치하지 않습니다.');
    }
    if (row.objectKey === image.oldKey) old++;
    else if (row.objectKey === image.newKey) migrated++;
    else throw new MigrationError('이관 기록과 현재 DB 사진 경로가 일치하지 않습니다.');
  }
  if (old && migrated) throw new MigrationError('DB 사진 경로가 일부만 변경되었습니다. 수동 점검이 필요합니다.');
  return old ? 'old' : 'new';
}

async function verifiedLocal(local: MigrationLocalStore, entry: MigrationEntry): Promise<Buffer> {
  let buffer: Buffer;
  try { ({ buffer } = await local.read(entry.oldKey)); }
  catch { throw new MigrationError('기존 사진 파일을 읽거나 확인하지 못했습니다.'); }
  if (buffer.length !== entry.sizeBytes || createHash('sha256').update(buffer).digest('hex') !== entry.sha256) {
    throw new MigrationError('기존 사진 파일의 크기 또는 SHA-256이 DB와 일치하지 않습니다.');
  }
  return buffer;
}

function sameEntries(a: readonly MigrationEntry[], b: readonly MigrationEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** No DB key is changed until every original and uploaded S3 object has been read and verified. */
export async function runMigration(options: MigrationOptions): Promise<MigrationResult> {
  const { mode, database, local, s3, bucket, prefix, localRoot } = options;
  s3KeyPattern(prefix);
  if (!bucket.trim() || !isAbsolute(localRoot)) throw new MigrationError('S3 버킷과 절대경로 REPORT_STORAGE_DIR이 필요합니다.');
  if (mode !== 'dry-run' && !s3) throw new MigrationError('S3 연결이 필요합니다.');
  if (mode !== 'dry-run' && (!options.manifestPath || !isAbsolute(options.manifestPath))) {
    throw new MigrationError('변경 작업에는 절대경로 --manifest가 필요합니다.');
  }
  const rows = await database.listImages();
  if (mode === 'dry-run') {
    const entries = planMigration(rows, prefix);
    for (const entry of entries) await verifiedLocal(local, entry);
    return { images: entries.length, status: 'planned' };
  }
  const manifestPath = options.manifestPath!;
  let manifest = await loadManifest(manifestPath, bucket, prefix, localRoot);
  if (mode === 'apply' && !manifest) {
    const entries = planMigration(rows, prefix);
    for (const entry of entries) await verifiedLocal(local, entry);
    if (!entries.length) return { images: 0, status: 'already-applied' };
    manifest = { version: 1, createdAt: new Date().toISOString(), bucket, prefix, localRoot, images: entries };
    await saveManifest(manifestPath, manifest);
  }
  if (!manifest) throw new MigrationError('해당 --manifest 이관 기록 파일이 없습니다.');
  const state = stateForManifest(rows, manifest.images);
  if (mode === 'rollback') {
    if (state === 'old') return { images: manifest.images.length, status: 'already-rolled-back' };
    for (const entry of manifest.images) await verifiedLocal(local, entry);
    await database.replaceKeys(manifest.images, 'backward', prefix);
    return { images: manifest.images.length, status: 'rolled-back' };
  }
  if (state === 'old') {
    const planned = planMigration(rows, prefix);
    if (!sameEntries(planned, manifest.images)) throw new MigrationError('이관 기록과 현재 DB 이관 대상 목록이 다릅니다.');
    for (const entry of manifest.images) await verifiedLocal(local, entry);
    if (mode === 'apply') {
      for (const entry of manifest.images) await s3!.ensure(entry, await verifiedLocal(local, entry));
      await database.replaceKeys(manifest.images, 'forward', prefix);
      return { images: manifest.images.length, status: 'applied' };
    }
    throw new MigrationError('DB 사진 경로가 아직 S3로 변경되지 않았습니다.');
  }
  for (const entry of manifest.images) await s3!.verify(entry);
  return { images: manifest.images.length, status: mode === 'verify' ? 'verified' : 'already-applied' };
}

export class PrismaMigrationDatabase implements MigrationDatabase {
  constructor(private readonly client: PrismaClient) {}

  listImages(): Promise<ImageRow[]> {
    return this.client.reportImage.findMany({
      select: { id: true, reportId: true, objectKey: true, mimeType: true, sizeBytes: true, sha256: true, exifRemoved: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
  }

  async replaceKeys(entries: readonly MigrationEntry[], direction: 'forward' | 'backward', prefix: string): Promise<void> {
    await this.client.$transaction(async transaction => {
      const current = await transaction.reportImage.findMany({ select: { id: true, objectKey: true } });
      const byId = new Map(current.map(row => [row.id, row.objectKey]));
      if (direction === 'forward') {
        const legacyIds = current.filter(row => LEGACY_KEY.test(row.objectKey)).map(row => row.id).sort();
        if (JSON.stringify(legacyIds) !== JSON.stringify(entries.map(entry => entry.id).sort())) {
          throw new MigrationError('이관 중 DB 사진 목록이 바뀌었습니다. 다시 실행하세요.');
        }
        const s3Key = s3KeyPattern(prefix);
        if (current.some(row => !LEGACY_KEY.test(row.objectKey) && !s3Key.test(row.objectKey))) {
          throw new MigrationError('이관 중 알 수 없는 DB 사진 경로가 생겼습니다.');
        }
      }
      for (const entry of entries) {
        const from = direction === 'forward' ? entry.oldKey : entry.newKey;
        const to = direction === 'forward' ? entry.newKey : entry.oldKey;
        if (byId.get(entry.id) !== from) throw new MigrationError('이관 중 DB 사진 경로가 바뀌었습니다. 다시 실행하세요.');
        const result = await transaction.reportImage.updateMany({ where: { id: entry.id, objectKey: from }, data: { objectKey: to } });
        if (result.count !== 1) throw new MigrationError('DB 사진 경로 변경이 완료되지 않았습니다.');
      }
    }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000 });
  }
}

export class S3MigrationObjectStore implements MigrationObjectStore {
  private readonly client: S3Client;
  constructor(private readonly bucket: string, region: string, client?: S3Client) {
    this.client = client ?? new S3Client({ region, maxAttempts: 2 });
  }

  async ensure(entry: MigrationEntry, buffer: Buffer): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: entry.newKey, Body: buffer, ContentType: 'image/jpeg', ContentLength: buffer.length,
        ChecksumSHA256: Buffer.from(entry.sha256, 'hex').toString('base64'), ServerSideEncryption: 'AES256',
        CacheControl: 'private, max-age=60', IfNoneMatch: '*',
      }), { abortSignal: AbortSignal.timeout(15000) });
    } catch (error) {
      // A retry may find an object from a previous run. Never overwrite it: GET verifies its bytes below.
      const status = error && typeof error === 'object' && '$metadata' in error
        ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode : undefined;
      if (status !== 412) throw new MigrationError('S3 사진 업로드에 실패했습니다. 권한과 버킷 설정을 확인하세요.');
    }
    await this.verify(entry);
  }

  async verify(entry: MigrationEntry): Promise<void> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: entry.newKey }),
        { abortSignal: AbortSignal.timeout(15000) });
      if (!response.Body || response.ContentLength !== entry.sizeBytes || response.ContentLength > MAX_EVIDENCE_BYTES) {
        throw new MigrationError('S3 사진 크기가 원본과 다릅니다.');
      }
      const body = Buffer.from(await response.Body.transformToByteArray());
      if (body.length !== entry.sizeBytes || createHash('sha256').update(body).digest('hex') !== entry.sha256) {
        throw new MigrationError('S3 사진 내용이 원본과 다릅니다.');
      }
    } catch (error) {
      if (error instanceof MigrationError) throw error;
      throw new MigrationError('S3 사진 읽기·내용 검증에 실패했습니다. 권한과 버킷 설정을 확인하세요.');
    }
  }

  close(): void { this.client.destroy(); }
}

interface CliOptions { mode: MigrationMode; manifestPath?: string }
function cliOptions(args: readonly string[]): CliOptions {
  let mode: MigrationMode = 'dry-run';
  let explicitMode = false;
  let manifestPath: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (['--dry-run', '--apply', '--verify', '--rollback'].includes(arg ?? '')) {
      if (explicitMode) throw new MigrationError('실행 모드를 하나만 지정하세요.');
      mode = arg!.slice(2) as MigrationMode;
      explicitMode = true;
    } else if (arg === '--manifest' && args[index + 1] && !manifestPath) {
      manifestPath = args[++index];
    } else throw new MigrationError('옵션은 --dry-run, --apply, --verify, --rollback, --manifest 경로만 사용할 수 있습니다.');
  }
  return manifestPath ? { mode, manifestPath } : { mode };
}

async function main(): Promise<void> {
  loadEnvironment({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  const { mode, manifestPath } = cliOptions(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  const localRoot = process.env.REPORT_STORAGE_DIR?.trim() ?? '';
  const region = process.env.AWS_REGION?.trim() ?? '';
  const bucket = process.env.S3_REPORT_BUCKET?.trim() ?? '';
  const prefix = process.env.S3_REPORT_PREFIX?.trim() || 'reports';
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl) || !isAbsolute(localRoot) || !region || !bucket) {
    throw new MigrationError('DATABASE_URL, 절대경로 REPORT_STORAGE_DIR, AWS_REGION, S3_REPORT_BUCKET을 설정하세요.');
  }
  const client = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
  const s3 = mode === 'dry-run' ? undefined : new S3MigrationObjectStore(bucket, region);
  try {
    const result = await runMigration({ mode, database: new PrismaMigrationDatabase(client), local: new LocalEvidenceStorage(localRoot),
      localRoot: resolve(localRoot), bucket, prefix, ...(manifestPath ? { manifestPath } : {}), ...(s3 ? { s3 } : {}) });
    console.info(`사진 이관 ${result.status}: ${result.images}장${manifestPath ? `; 기록 ${manifestPath}` : ''}`);
  } finally {
    s3?.close();
    await client.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof MigrationError ? error.message : '사진 이관에 실패했습니다. DB·S3 상태를 확인하세요.');
    process.exitCode = 1;
  });
}
