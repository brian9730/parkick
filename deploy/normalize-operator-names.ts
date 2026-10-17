import { open } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '../backend/src/generated/prisma/client.js';
import type { Prisma } from '../backend/src/generated/prisma/client.js';
import { normalizeOperatorName } from '../backend/src/catalog/operators.js';

export type Options = { apply: false } | { apply: true; backup: string };

export function parseOptions(args: readonly string[]): Options {
  if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) return { apply: false };
  if (args.length === 3 && args[0] === '--apply' && args[1] === '--backup'
    && args[2] && isAbsolute(args[2]) && !args[2].includes('\0')) return { apply: true, backup: args[2] };
  throw new Error('Use no arguments for preview, or --apply --backup <absolute new file>.');
}

function assertTarget(): void {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'production' || !['postgresql:', 'postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.port !== '5432' || url.pathname !== '/parkick'
    || url.username !== 'parkick_app' || !url.password || url.hash
    || [...url.searchParams.keys()].some(key => key !== 'schema')
    || url.searchParams.getAll('schema').length > 1
    || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error('Invalid production database target.');
  }
}

/** Must run inside a single transaction. No ORM updates: preserve updated_at and submission_hash. */
export async function normalizeReports(transaction: Pick<Prisma.TransactionClient, 'report' | '$executeRaw'>, options: Options) {
  const rows = await transaction.report.findMany({ select: { id: true, operatorName: true }, orderBy: { id: 'asc' } });
  const changes = rows.flatMap(row => {
    const canonicalName = normalizeOperatorName(row.operatorName);
    return canonicalName !== row.operatorName && canonicalName !== null
      ? [{ id: row.id, operatorName: row.operatorName!, canonicalName }] : [];
  });

  if (options.apply) {
    // 'wx' refuses existing files and symlinks. The caller chooses a private
    // absolute location outside the web root; this script never overwrites it.
    const backup = await open(options.backup, 'wx', 0o600);
    try {
      await backup.writeFile(`${JSON.stringify(changes.map(({ id, operatorName }) => ({ id, operatorName })), null, 2)}\n`, 'utf8');
      await backup.sync();
    } finally { await backup.close(); }

    for (const change of changes) {
      const count = await transaction.$executeRaw`
        UPDATE "reports" SET "operator_name" = ${change.canonicalName}
        WHERE "id" = ${change.id}::uuid AND "operator_name" = ${change.operatorName}
      `;
      if (count !== 1) throw new Error('Report changed while normalizing; rollback required.');
    }
  }
  return { mode: options.apply ? 'apply' : 'dry-run', total: rows.length, eligible: changes.length, changed: options.apply ? changes.length : 0 };
}

async function main(): Promise<void> {
  let client: PrismaClient | undefined;
  try {
    const options = parseOptions(process.argv.slice(2));
    assertTarget();
    client = new PrismaClient({ log: [] });
    const result = await client.$transaction(transaction => normalizeReports(transaction, options), {
      isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000,
    });
    console.info(JSON.stringify(result));
  } catch {
    // Do not print DB URLs/errors, backup contents, report IDs or operator names.
    console.error('업체명 정규화를 완료하지 못했습니다. 운영 DB 대상·인수·새 백업 경로·동시 변경 여부를 확인해주세요. 백업 파일은 덮어쓰지 않습니다.');
    process.exitCode = 1;
  } finally {
    try { await client?.$disconnect(); }
    catch {
      console.error('DB 연결 종료 상태를 확인하지 못했습니다. 적용 여부는 기본 미리보기 명령으로 다시 확인해주세요.');
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) await main();
