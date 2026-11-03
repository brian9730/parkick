import { PrismaClient } from '../backend/src/generated/prisma/client.js';
import { parseCollectorAccountArgs, provisionCollectorAccount } from './collector-account.js';

function assertProductionDatabaseTarget(): void {
  if (process.env.NODE_ENV !== 'production' || !process.stdout.isTTY) {
    throw new Error('Production interactive terminal required.');
  }
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '5432'
    || url.pathname !== '/parkick' || url.username !== 'parkick_app' || !url.password || url.hash
    || [...url.searchParams.keys()].some(key => key !== 'schema')
    || url.searchParams.getAll('schema').length > 1
    || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error('Invalid database target.');
  }
}

let client: PrismaClient | undefined;
try {
  assertProductionDatabaseTarget();
  const input = parseCollectorAccountArgs(process.argv.slice(2));
  client = new PrismaClient({ log: [] });
  const account = await provisionCollectorAccount(client, input);
  // No credential appears in arguments, environment variables, files, or ORM logs.
  // A real terminal is required so shell redirection cannot capture this one-time password.
  process.stdout.write(`수거 담당자 계정 생성 완료\n이메일: ${account.email}\n임시 비밀번호: ${account.password}\n`);
} catch {
  // Do not print database details, arguments, generated passwords, or ORM errors.
  console.error('수거 담당자 계정 생성 실패: 운영 DB 대상, 기관 코드, 이메일 중복, 마이그레이션 상태를 확인하세요. 기존 계정은 변경하지 않았습니다.');
  process.exitCode = 1;
} finally {
  try { await client?.$disconnect(); }
  catch { console.error('DB 연결 종료 상태를 확인하지 못했습니다. 계정 생성 상태를 확인하세요.'); }
}
