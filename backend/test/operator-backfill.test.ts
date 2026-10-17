import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { describe, it, type TestContext } from 'node:test';
import type { Prisma } from '../src/generated/prisma/client.js';
import { normalizeReports, parseOptions } from '../../deploy/normalize-operator-names.js';

async function backupPath(context: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'parkick-operator-backfill-'));
  context.after(async () => {
    const child = relative(tmpdir(), directory);
    assert.ok(child.startsWith('parkick-operator-backfill-') && !child.includes('..') && !isAbsolute(child));
    await rm(directory, { recursive: true, force: true });
  });
  return join(directory, 'before.json');
}

function transaction(execute: (sql: TemplateStringsArray, ...values: unknown[]) => Promise<number>) {
  return {
    report: { findMany: async () => [
      { id: '00000000-0000-4000-8000-000000000001', operatorName: 'kakao-bike' },
      { id: '00000000-0000-4000-8000-000000000002', operatorName: '빔' },
      { id: '00000000-0000-4000-8000-000000000003', operatorName: '기타 사용자 입력 업체' },
      { id: '00000000-0000-4000-8000-000000000004', operatorName: null },
    ] },
    $executeRaw: execute,
  } as unknown as Pick<Prisma.TransactionClient, 'report' | '$executeRaw'>;
}

describe('Scoped operator-name backfill without a database', () => {
  it('defaults to preview and requires an explicit absolute backup path for apply', () => {
    assert.deepEqual(parseOptions([]), { apply: false });
    assert.deepEqual(parseOptions(['--dry-run']), { apply: false });
    const backup = join(tmpdir(), 'before.json');
    assert.deepEqual(parseOptions(['--apply', '--backup', backup]), { apply: true, backup });
    for (const args of [['--apply'], ['--backup', backup], ['--apply', '--backup', 'relative.json'], ['--apply', '--backup', backup, '--force']]) {
      assert.throws(() => parseOptions(args));
    }
  });

  it('previews only recognized aliases and performs no writes', async () => {
    const result = await normalizeReports(transaction(async () => { assert.fail('Preview must never issue an UPDATE'); }), { apply: false });
    assert.deepEqual(result, { mode: 'dry-run', total: 4, eligible: 1, changed: 0 });
  });

  it('writes a private original-value snapshot before a parameterized update of only the operator column', async context => {
    const backup = await backupPath(context);
    let calls = 0;
    const result = await normalizeReports(transaction(async (sql, ...values) => {
      calls += 1;
      assert.deepEqual(JSON.parse(await readFile(backup, 'utf8')), [{ id: '00000000-0000-4000-8000-000000000001', operatorName: 'kakao-bike' }]);
      assert.deepEqual(values, ['카카오 T 바이크', '00000000-0000-4000-8000-000000000001', 'kakao-bike']);
      const statement = sql.join('?').replace(/\s+/g, ' ').trim();
      assert.equal(statement, 'UPDATE "reports" SET "operator_name" = ? WHERE "id" = ?::uuid AND "operator_name" = ?');
      return 1;
    }), { apply: true, backup });
    assert.equal(calls, 1);
    assert.deepEqual(result, { mode: 'apply', total: 4, eligible: 1, changed: 1 });
    if (process.platform !== 'win32') assert.equal((await stat(backup)).mode & 0o777, 0o600);
  });

  it('refuses to overwrite a backup before issuing any update', async context => {
    const backup = await backupPath(context);
    await writeFile(backup, 'existing backup', { mode: 0o600 });
    await assert.rejects(normalizeReports(transaction(async () => { assert.fail('Existing backup must prevent UPDATE'); }), { apply: true, backup }));
    assert.equal(await readFile(backup, 'utf8'), 'existing backup');
  });

  it('throws on a nonexact match count so the surrounding transaction rolls back', async context => {
    for (const changed of [0, 2]) {
      const backup = await backupPath(context);
      await assert.rejects(normalizeReports(transaction(async () => changed), { apply: true, backup }), /rollback required/);
      assert.equal(JSON.parse(await readFile(backup, 'utf8')).length, 1);
    }
  });
});
