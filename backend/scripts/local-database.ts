import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
export const localDatabaseUrl = 'postgresql://parkick_local@127.0.0.1:55432/parkick';
export const localTestDatabaseUrl = 'postgresql://parkick_local@127.0.0.1:55432/parkick_test';
export const localDatabasePort = 55432;
export const localDatabaseUser = 'parkick_local';
export const localDataDirectory = resolve(backendDirectory, 'data', 'postgres');

export function assertDevelopmentOnly(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('이 도구는 로컬 개발 환경에서만 사용할 수 있습니다.');
  }
}

/** Setup/migration helpers must never silently act on an unrelated configured database. */
export function assertTaskLocalDatabase(value: string | undefined, allowTest = false): void {
  assertDevelopmentOnly();
  let url: URL;
  try { url = new URL(value ?? ''); }
  catch { throw new Error('DATABASE_URL을 로컬 개발 DB로 설정해주세요.'); }
  const allowedPaths = allowTest ? ['/parkick', '/parkick_test'] : ['/parkick'];
  const queryKeys = [...url.searchParams.keys()];
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.port !== String(localDatabasePort)
    || url.username !== localDatabaseUser
    || !allowedPaths.includes(url.pathname)
    || url.hash
    || queryKeys.some((key) => key !== 'schema')
    || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error('자동 설정은 127.0.0.1:55432의 parkick 로컬 DB만 지원합니다. 기존 DATABASE_URL은 변경하지 않았습니다.');
  }
}
