import { z } from 'zod';
import { PrismaClient } from '../backend/src/generated/prisma/client.js';
import { hashPassword, verifyPassword } from '../backend/src/services/admin/password.js';

const accountSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(80),
});

function assertTarget(): void {
  if (process.env.NODE_ENV !== 'production' || process.argv.length !== 2 || process.stdin.isTTY) {
    throw new Error('Invalid invocation.');
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

async function readAccount() {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 4096) throw new Error('Input is too large.');
    chunks.push(buffer);
  }
  return accountSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')));
}

// Explicit one-time provisioning only. Credentials enter through stdin and are never echoed.
let client: PrismaClient | undefined;
try {
  assertTarget();
  const account = await readAccount();
  client = new PrismaClient({ log: [] });
  const result = await client.$transaction(async transaction => {
    const matches = await transaction.admin.findMany({
      where: { email: { equals: account.email, mode: 'insensitive' } }, take: 2,
      select: { email: true, passwordHash: true, name: true, role: true, tenantId: true, active: true },
    });
    if (matches.length) {
      const existing = matches[0]!;
      if (matches.length !== 1 || existing.email !== account.email || existing.name !== account.name
        || existing.role !== 'PLATFORM_ADMIN' || existing.tenantId !== null || !existing.active
        || !await verifyPassword(account.password, existing.passwordHash)) {
        throw new Error('Existing account differs; refusing to overwrite.');
      }
      return 'already-present';
    }
    await transaction.admin.create({
      data: {
        email: account.email, passwordHash: await hashPassword(account.password), name: account.name,
        role: 'PLATFORM_ADMIN', tenantId: null, active: true,
      },
      select: { id: true },
    });
    return 'created';
  });
  console.info(JSON.stringify({ status: result, role: 'PLATFORM_ADMIN' }));
} catch {
  // Never print input, URLs, Prisma errors, hashes, or any account details.
  console.error('관리자 계정을 생성하지 못했습니다. 운영 DB 대상·표준입력 형식·기존 계정 일치 여부를 확인해주세요. 기존 계정은 덮어쓰지 않습니다.');
  process.exitCode = 1;
} finally {
  try { await client?.$disconnect(); }
  catch {
    console.error('DB 연결 종료 상태를 확인하지 못했습니다. 같은 입력으로 다시 실행해 계정 상태를 확인해주세요.');
    process.exitCode = 1;
  }
}
