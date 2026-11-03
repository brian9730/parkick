import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { verifyPassword } from '../src/services/admin/password.js';
import { parseCollectorAccountArgs, provisionCollectorAccount } from '../../deploy/collector-account.js';

type StoredAccount = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'TENANT_ADMIN' | 'COLLECTOR';
  tenantId: string;
  active: boolean;
};

const input = () => ({ tenantCode: 'local-development', email: 'collector@example.test', name: '수거 담당자' });

function fixture(tenantActive = true) {
  const tenantId = randomUUID();
  const manager: StoredAccount = {
    id: randomUUID(), email: 'manager@example.test', name: '기존 관리자',
    passwordHash: 'existing-hash', role: 'TENANT_ADMIN', tenantId, active: true,
  };
  const accounts: StoredAccount[] = [{ ...manager }];
  const transaction = {
    tenant: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        where.code === 'local-development' ? { id: tenantId, active: tenantActive } : null,
    },
    admin: {
      findMany: async ({ where }: { where: { email: { equals: string } } }) =>
        accounts.filter(row => row.email.toLowerCase() === where.email.equals.toLowerCase()),
      create: async ({ data }: { data: Omit<StoredAccount, 'id'> }) => {
        const id = randomUUID();
        accounts.push({ id, ...data });
        return { id };
      },
    },
  };
  const client = {
    $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) => {
      const snapshot = accounts.map(row => ({ ...row }));
      try { return await operation(transaction); }
      catch (error) { accounts.splice(0, accounts.length, ...snapshot); throw error; }
    },
  } as unknown as PrismaClient;
  return { client, accounts, manager };
}

describe('Single collector account provisioning', () => {
  it('creates a collector with a fresh password while preserving the existing manager exactly', async () => {
    const { client, accounts, manager } = fixture();
    const result = await provisionCollectorAccount(client, { ...input(), email: 'Collector@Example.test' });
    assert.equal(result.email, 'collector@example.test');
    assert.match(result.password, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(accounts[0], manager);
    assert.equal(accounts.length, 2);
    assert.equal(accounts[1]!.role, 'COLLECTOR');
    assert.equal(accounts[1]!.tenantId, manager.tenantId);
    assert.ok(await verifyPassword(result.password, accounts[1]!.passwordHash));
    assert.ok(!JSON.stringify(accounts).includes(result.password));
  });

  it('refuses duplicate emails regardless of case without changing either account', async () => {
    const { client, accounts } = fixture();
    const before = structuredClone(accounts);
    await assert.rejects(provisionCollectorAccount(client, { ...input(), email: 'MANAGER@example.test' }),
      /Email already belongs/);
    assert.deepEqual(accounts, before);
    await provisionCollectorAccount(client, input());
    const after = structuredClone(accounts);
    await assert.rejects(provisionCollectorAccount(client, { ...input(), email: 'COLLECTOR@example.test' }),
      /Email already belongs/);
    assert.deepEqual(accounts, after);
  });

  it('rejects unknown or inactive tenants and invalid fields before writing', async () => {
    const inactive = fixture(false);
    await assert.rejects(provisionCollectorAccount(inactive.client, input()), /Tenant does not exist or is inactive/);
    assert.equal(inactive.accounts.length, 1);
    const active = fixture();
    await assert.rejects(provisionCollectorAccount(active.client, { ...input(), tenantCode: 'unknown' }),
      /Tenant does not exist or is inactive/);
    await assert.rejects(provisionCollectorAccount(active.client, { ...input(), role: 'PLATFORM_ADMIN' }));
    assert.equal(active.accounts.length, 1);
  });

  it('accepts only three named non-secret CLI fields', () => {
    assert.deepEqual(parseCollectorAccountArgs([
      '--name', ' 수거 담당자 ', '--email', 'COLLECTOR@example.test', '--tenant-code', 'local-development',
    ]), input());
    assert.throws(() => parseCollectorAccountArgs([
      '--tenant-code', 'local-development', '--email', 'collector@example.test', '--password', 'secret',
    ]));
    assert.throws(() => parseCollectorAccountArgs([
      '--tenant-code', 'local-development', '--email', 'collector@example.test', '--email', 'other@example.test',
    ]));
  });
});
