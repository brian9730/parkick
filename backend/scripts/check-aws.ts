import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config as loadEnvironment } from 'dotenv';
import sharp from 'sharp';

export interface S3CheckConfig {
  region: string;
  bucket: string;
  prefix: string;
}

class ConnectionCheckError extends Error {}

/** This check deliberately does not load unrelated database, AI or administrator settings. */
export function readS3CheckConfig(environment: NodeJS.ProcessEnv = process.env): S3CheckConfig {
  const region = environment.AWS_REGION?.trim() ?? '';
  const bucket = environment.S3_REPORT_BUCKET?.trim() ?? '';
  const prefix = environment.S3_REPORT_PREFIX?.trim() ?? 'reports';
  const invalid: string[] = [];
  if (environment.REPORT_STORAGE_PROVIDER !== 's3') invalid.push('REPORT_STORAGE_PROVIDER');
  if (region.length > 100 || !/^[a-z]{2,4}(?:-[a-z0-9]+)+-\d+$/.test(region)) invalid.push('AWS_REGION');
  if (!/^(?!\d{1,3}(?:\.\d{1,3}){3}$)(?!.*\.\.)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) invalid.push('S3_REPORT_BUCKET');
  if (prefix.length > 256 || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix)) invalid.push('S3_REPORT_PREFIX');
  if (invalid.length) throw new ConnectionCheckError(`AWS 연결 확인에 필요한 설정을 확인하세요: ${invalid.join(', ')}`);
  return { region, bucket, prefix };
}

async function withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new ConnectionCheckError('S3 연결 확인 시간이 초과되었습니다.'));
        }, 15_000);
      }),
    ]);
  } finally { clearTimeout(timeout); }
}

/** Writes only a new UUID test object, and attempts cleanup even if a Put response is lost. */
export async function checkS3Connection(configuration: S3CheckConfig, injectedClient?: S3Client): Promise<void> {
  // The SDK default chain supports AWS_PROFILE/login cache locally and an instance role on EC2.
  const client = injectedClient ?? new S3Client({ region: configuration.region, maxAttempts: 2 });
  const key = `${configuration.prefix}/connection-check/${randomUUID()}.jpg`;
  let uploadAttempted = false;
  let versionId: string | undefined;
  let failure: ConnectionCheckError | undefined;
  let stage = '테스트 사진 생성';
  let downloadBody: unknown;
  try {
    const photo = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#55aa77' } }).jpeg().toBuffer();
    stage = '업로드';
    uploadAttempted = true;
    const uploaded = await withDeadline((abortSignal) => client.send(new PutObjectCommand({
      Bucket: configuration.bucket, Key: key, Body: photo, ContentType: 'image/jpeg',
      ContentLength: photo.length, ServerSideEncryption: 'AES256', CacheControl: 'private, no-store',
    }), { abortSignal }));
    versionId = uploaded.VersionId;
    stage = '읽기·내용 검증';
    const downloaded = await withDeadline(async (abortSignal) => {
      const response = await client.send(new GetObjectCommand({
        Bucket: configuration.bucket, Key: key, ...(versionId ? { VersionId: versionId } : {}),
      }), { abortSignal });
      downloadBody = response.Body;
      if (!response.Body || response.ContentLength !== photo.length) throw new ConnectionCheckError('S3 테스트 사진의 크기가 일치하지 않습니다.');
      return response.Body.transformToByteArray();
    });
    if (!photo.equals(Buffer.from(downloaded))) throw new ConnectionCheckError('S3 테스트 사진의 내용이 일치하지 않습니다.');
  } catch {
    // Never print SDK error messages, account identifiers, credentials or environment values.
    failure = new ConnectionCheckError(`S3 ${stage} 확인에 실패했습니다. AWS 인증·리전·버킷과 해당 객체 권한을 확인하세요.`);
  } finally {
    if (downloadBody instanceof Readable) downloadBody.destroy();
    if (uploadAttempted) {
      try {
        // Exact-version deletion also removes the probe from a versioned bucket when Put succeeded.
        await withDeadline((abortSignal) => client.send(new DeleteObjectCommand({
          Bucket: configuration.bucket, Key: key, ...(versionId ? { VersionId: versionId } : {}),
        }), { abortSignal }));
      } catch {
        failure = new ConnectionCheckError('S3 연결 확인용 사진 삭제에 실패했습니다. S3_REPORT_PREFIX 아래 connection-check 경로의 테스트 사진을 확인하세요.');
      }
    }
    client.destroy();
  }
  if (failure) throw failure;
}

async function main(): Promise<void> {
  const loaded = loadEnvironment({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
  const environmentError: unknown = loaded.error;
  if (environmentError && !(typeof environmentError === 'object' && 'code' in environmentError && environmentError.code === 'ENOENT')) {
    throw new ConnectionCheckError('backend/.env를 읽지 못했습니다.');
  }
  await checkS3Connection(readS3CheckConfig());
  console.info('S3 연결 확인 완료: 테스트 사진 업로드·읽기·내용 검증·삭제 성공.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof ConnectionCheckError ? error.message : 'AWS 연결을 확인하지 못했습니다. 설정과 인증을 확인하세요.');
    process.exitCode = 1;
  });
}
