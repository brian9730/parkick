import { z } from 'zod';
import { isAbsolute, resolve } from 'node:path';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  TRUST_PROXY: z.enum(['false', 'loopback']).default('false'),
  FRONTEND_ORIGIN: z.url().default('http://localhost:5173'),
  ENABLE_DEV_ADMIN: z.enum(['true', 'false']).default('false'),
  DEV_ADMIN_EMAIL: z.string().default(''),
  DEV_ADMIN_PASSWORD: z.string().default(''),
  DEV_ADMIN_NAME: z.string().min(1).max(80).default('개발 관리자'),
  AI_PROVIDER: z.preprocess(value => value === '' ? undefined : value, z.enum(['disabled', 'mock', 'bedrock']).optional()),
  AWS_REGION: z.string().trim().max(100).default(''),
  BEDROCK_REGION: z.string().trim().max(100).default(''),
  BEDROCK_REPORT_MODEL_ID: z.string().trim().max(2048).default(''),
  DATABASE_URL: z.string().trim().default(''),
  REPORT_STORAGE_DIR: z.string().trim().default(''),
  REPORT_STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  S3_REPORT_BUCKET: z.string().trim().default(''),
  S3_REPORT_PREFIX: z.string().trim().max(256).default('reports'),
  REPORT_REGION_CODE: z.string().trim().min(1).max(80).default('local-development'),
  PHONE_ENCRYPTION_KEY: z.string().trim().default(''),
  PHONE_LOOKUP_HMAC_KEY: z.string().trim().default(''),
});

export type AIConfig = { mode: 'mock' | 'disabled' } | { mode: 'bedrock'; region: string; modelId: string };
export type EvidenceStorageConfig = { mode: 'local' } | { mode: 's3'; region: string; bucket: string; prefix: string };
export interface ReportConfig {
  databaseUrl: string;
  storageDir: string;
  storage?: EvidenceStorageConfig;
  regionCode: string;
  encryptionKey: Buffer;
  lookupKey: Buffer;
}

export interface AppConfig {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  trustProxy?: false | 'loopback';
  frontendOrigin: string;
  devAdmin: { email: string; password: string; name: string } | null;
  sessionTtlMs: number;
  ai: AIConfig;
  reports?: ReportConfig;
}

/** Keep direct application construction subject to the same report storage boundaries. */
export function assertProductionReportConfig(config: AppConfig): void {
  if (config.environment !== 'production') return;
  if (!config.reports) return;
  let origin: URL;
  let database: URL;
  try {
    origin = new URL(config.frontendOrigin);
    database = new URL(config.reports.databaseUrl);
  } catch {
    throw new Error('운영 신고 저장에는 HTTPS FRONTEND_ORIGIN과 비밀번호가 있는 PostgreSQL DATABASE_URL이 필요합니다.');
  }
  if (origin.protocol !== 'https:' || origin.origin !== config.frontendOrigin
    || !['postgres:', 'postgresql:'].includes(database.protocol) || !database.password) {
    throw new Error('운영 신고 저장에는 HTTPS FRONTEND_ORIGIN과 비밀번호가 있는 PostgreSQL DATABASE_URL이 필요합니다.');
  }
  if (!config.reports.storage) throw new Error('운영 신고 저장에는 REPORT_STORAGE_PROVIDER를 명시적으로 설정하세요.');
  if (config.reports.storage.mode === 'local' && (!config.reports.storageDir.trim() || !isAbsolute(config.reports.storageDir))) {
    throw new Error('운영 로컬 신고 저장에는 절대경로 REPORT_STORAGE_DIR이 필요합니다.');
  }
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    // Never include environment values (which may contain secrets) in errors.
    throw new Error(`환경변수 형식을 확인하세요: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  const env = parsed.data;
  const origin = new URL(env.FRONTEND_ORIGIN);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== env.FRONTEND_ORIGIN) {
    throw new Error('FRONTEND_ORIGIN은 경로가 없는 http/https Origin이어야 합니다.');
  }
  const enabled = env.ENABLE_DEV_ADMIN === 'true';
  if (enabled && env.NODE_ENV === 'production') {
    throw new Error('운영 환경에서는 개발용 MOCK 관리자 인증을 사용할 수 없습니다.');
  }
  if (enabled && (!z.email().safeParse(env.DEV_ADMIN_EMAIL).success || env.DEV_ADMIN_PASSWORD.length < 12 || env.DEV_ADMIN_PASSWORD.length > 128)) {
    throw new Error('개발 관리자 이메일과 12~128자 비밀번호를 환경변수에 설정하세요.');
  }
  const aiMode = env.AI_PROVIDER ?? (env.NODE_ENV === 'production' ? 'disabled' : 'mock');
  if (aiMode === 'mock' && env.NODE_ENV === 'production') {
    throw new Error('운영 환경에서는 MOCK AI를 사용할 수 없습니다.');
  }
  const bedrockRegion = env.BEDROCK_REGION || env.AWS_REGION;
  if (aiMode === 'bedrock' && (!bedrockRegion || !env.BEDROCK_REPORT_MODEL_ID)) {
    throw new Error('Bedrock 사용에는 BEDROCK_REGION 또는 AWS_REGION과 BEDROCK_REPORT_MODEL_ID 설정이 필요합니다.');
  }
  let reports: ReportConfig | undefined;
  if (env.REPORT_STORAGE_PROVIDER === 's3' && (!env.DATABASE_URL || !env.AWS_REGION || !env.S3_REPORT_BUCKET)) {
    throw new Error('S3 신고 저장에는 DATABASE_URL, AWS_REGION, S3_REPORT_BUCKET 설정이 필요합니다.');
  }
  if (env.DATABASE_URL) {
    if (env.NODE_ENV === 'production' && env.REPORT_STORAGE_PROVIDER === 'local'
      && (environment.REPORT_STORAGE_PROVIDER !== 'local' || !env.REPORT_STORAGE_DIR || !isAbsolute(env.REPORT_STORAGE_DIR))) {
      throw new Error('운영 로컬 신고 저장에는 REPORT_STORAGE_PROVIDER=local과 절대경로 REPORT_STORAGE_DIR을 명시적으로 설정하세요.');
    }
    const database = z.url().safeParse(env.DATABASE_URL);
    if (!database.success || !['postgres:', 'postgresql:'].includes(new URL(database.data).protocol)) {
      throw new Error('DATABASE_URL에 PostgreSQL 연결 문자열을 설정하세요.');
    }
    if (env.REPORT_STORAGE_PROVIDER === 's3' && (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.S3_REPORT_BUCKET)
      || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(env.S3_REPORT_PREFIX))) {
      throw new Error('S3_REPORT_BUCKET 또는 S3_REPORT_PREFIX 형식을 확인하세요.');
    }
    const decodeKey = (value: string, name: string) => {
      const key = Buffer.from(value, 'base64');
      if (key.length !== 32 || key.toString('base64') !== value) throw new Error(`${name}에 base64로 인코딩한 32바이트 키를 설정하세요.`);
      return key;
    };
    const encryptionKey = decodeKey(env.PHONE_ENCRYPTION_KEY, 'PHONE_ENCRYPTION_KEY');
    const lookupKey = decodeKey(env.PHONE_LOOKUP_HMAC_KEY, 'PHONE_LOOKUP_HMAC_KEY');
    if (encryptionKey.equals(lookupKey)) throw new Error('전화번호 암호화와 조회에는 서로 다른 키를 사용하세요.');
    reports = {
      databaseUrl: env.DATABASE_URL, storageDir: resolve(env.REPORT_STORAGE_DIR || 'data/reports'),
      storage: env.REPORT_STORAGE_PROVIDER === 's3'
        ? { mode: 's3', region: env.AWS_REGION, bucket: env.S3_REPORT_BUCKET, prefix: env.S3_REPORT_PREFIX }
        : { mode: 'local' },
      regionCode: env.REPORT_REGION_CODE, encryptionKey, lookupKey,
    };
  }
  const config: AppConfig = {
    environment: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    trustProxy: env.TRUST_PROXY === 'loopback' ? 'loopback' : false,
    frontendOrigin: env.FRONTEND_ORIGIN,
    devAdmin: enabled ? {
      email: env.DEV_ADMIN_EMAIL.trim().toLowerCase(),
      password: env.DEV_ADMIN_PASSWORD,
      name: env.DEV_ADMIN_NAME,
    } : null,
    sessionTtlMs: 8 * 60 * 60 * 1000,
    ai: aiMode === 'bedrock'
      ? { mode: aiMode, region: bedrockRegion, modelId: env.BEDROCK_REPORT_MODEL_ID }
      : { mode: aiMode },
    ...(reports ? { reports } : {}),
  };
  assertProductionReportConfig(config);
  return config;
}
