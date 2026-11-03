import { z } from 'zod';
import type { PrismaClient } from '../backend/src/generated/prisma/client.js';
import { hashPassword, verifyPassword } from '../backend/src/services/admin/password.js';

const credentialSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(80),
});

export const staffAccountsSchema = z.strictObject({
  tenantCode: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  manager: credentialSchema,
  collector: credentialSchema,
}).superRefine((value, context) => {
  if (value.manager.email === value.collector.email) {
    context.addIssue({ code: 'custom', path: ['collector', 'email'], message: 'Staff accounts must have different emails.' });
  }
  if (value.manager.password === value.collector.password) {
    context.addIssue({ code: 'custom', path: ['collector', 'password'], message: 'Staff accounts must have different passwords.' });
  }
});

type StaffAccounts = z.infer<typeof staffAccountsSchema>;
type StaffRole = 'TENANT_ADMIN' | 'COLLECTOR';

/** Create both tenant-scoped staff accounts atomically, without changing existing accounts. */
export async function provisionStaffAccounts(client: PrismaClient, rawInput: unknown): Promise<{
  manager: 'created' | 'already-present';
  collector: 'created' | 'already-present';
}> {
  const input: StaffAccounts = staffAccountsSchema.parse(rawInput);
  return client.$transaction(async transaction => {
    const tenant = await transaction.tenant.findUnique({
      where: { code: input.tenantCode }, select: { id: true, active: true },
    });
    if (!tenant?.active) throw new Error('Tenant does not exist or is inactive.');

    const createOrVerify = async (role: StaffRole, account: StaffAccounts['manager']) => {
      const matches = await transaction.admin.findMany({
        where: { email: { equals: account.email, mode: 'insensitive' } }, take: 2,
        select: { email: true, passwordHash: true, name: true, role: true, tenantId: true, active: true },
      });
      if (matches.length) {
        const existing = matches[0]!;
        if (matches.length !== 1 || existing.email !== account.email || existing.name !== account.name
          || existing.role !== role || existing.tenantId !== tenant.id || !existing.active
          || !await verifyPassword(account.password, existing.passwordHash)) {
          throw new Error('Existing account differs; refusing to overwrite.');
        }
        return 'already-present' as const;
      }

      await transaction.admin.create({
        data: {
          email: account.email,
          passwordHash: await hashPassword(account.password),
          name: account.name,
          role,
          tenantId: tenant.id,
          active: true,
        },
        select: { id: true },
      });
      return 'created' as const;
    };

    const manager = await createOrVerify('TENANT_ADMIN', input.manager);
    const collector = await createOrVerify('COLLECTOR', input.collector);
    return { manager, collector };
  });
}
