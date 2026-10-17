import { config } from 'dotenv';
import { resolve } from 'node:path';
import { assertTaskLocalDatabase, backendDirectory } from './local-database.js';

config({ path: resolve(backendDirectory, '.env'), quiet: true });
try {
  assertTaskLocalDatabase(process.env.DATABASE_URL);
  console.info('로컬 개발 DB 대상 확인 완료: 127.0.0.1:55432/parkick');
} catch (error) {
  console.error(error instanceof Error ? error.message : '로컬 DB 대상 확인에 실패했습니다.');
  process.exitCode = 1;
}
