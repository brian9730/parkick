import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { verifyPassword } from '../src/services/admin/password.js';
import { provisionStaffAccounts, staffAccountsSchema } from '../../deploy/staff-accounts.js';

type StaffRole = 'TENANT_ADMIN' | 'COLLECTOR';
type StoredAccount = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: StaffRole;
  tenantId: string;
  active: boolean;
};

const input = () => ({
  tenantCode: 'local-development',
  manager: { email: 'Manager@Example.test', password: 'different-manager-password', name: 'Manager' },
  collector: { email: 'Collector@Example.test', password: 'different-collector-password', name: 'Collector' },
});

function fixture(active = true) {
  const tenantId = randomUUID();
  const accounts: StoredAccount[] = [];
  const transaction = {
    tenant: {
      findUnique: async ({ where }: { where: { code: string } }) =>
        where.code === 'local-development' ? { id: tenantId, active } : null,
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
  return { client, accounts, tenantId };
}

describe('Tenant staff account provisioning', () => {
  it('creates different manager and collector identities in one tenant without storing plaintext passwords', async () => {
    const { client, accounts, tenantId } = fixture();
    const credentials = input();
    assert.deepEqual(await provisionStaffAccounts(client, credentials), { manager: 'created', collector: 'created' });
    assert.deepEqual(accounts.map(row => [row.email, row.role, row.tenantId]), [
      ['manager@example.test', 'TENANT_ADMIN', tenantId],
      ['collector@example.test', 'COLLECTOR', tenantId],
    ]);
    assert.ok(await verifyPassword(credentials.manager.password, accounts[0]!.passwordHash));
    assert.ok(await verifyPassword(credentials.collector.password, accounts[1]!.passwordHash));
    assert.ok(!JSON.stringify(accounts).includes(credentials.manager.password));
    assert.ok(!JSON.stringify(accounts).includes(credentials.collector.password));
    assert.deepEqual(await provisionStaffAccounts(client, credentials), {
      manager: 'already-present', collector: 'already-present',
    });
    assert.equal(accounts.length, 2);
  });

  it('rejects shared credentials and unknown input keys before writing', async () => {
    const { client, accounts } = fixture();
    const sameEmail = input();
    sameEmail.collector.email = 'MANAGER@example.test';
    await assert.rejects(provisionStaffAccounts(client, sameEmail));
    const samePassword = input();
    samePassword.collector.password = samePassword.manager.password;
    await assert.rejects(provisionStaffAccounts(client, samePassword));
    assert.equal(staffAccountsSchema.safeParse({ ...input(), role: 'PLATFORM_ADMIN' }).success, false);
    assert.equal(accounts.length, 0);
  });

  it('does not create an account for an inactive or different tenant', async () => {
    const inactive = fixture(false);
    await assert.rejects(provisionStaffAccounts(inactive.client, input()), /Tenant does not exist or is inactive/);
    assert.equal(inactive.accounts.length, 0);
    const active = fixture();
    await assert.rejects(provisionStaffAccounts(active.client, { ...input(), tenantCode: 'unknown' }),
      /Tenant does not exist or is inactive/);
    assert.equal(active.accounts.length, 0);
  });

  it('rolls back both account writes when an existing email conflicts', async () => {
    const { client, accounts, tenantId } = fixture();
    accounts.push({
      id: randomUUID(), email: 'collector@example.test', passwordHash: 'old-hash', name: 'Other',
      role: 'TENANT_ADMIN', tenantId, active: true,
    });
    await assert.rejects(provisionStaffAccounts(client, input()), /Existing account differs/);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0]!.name, 'Other');
  });
});
