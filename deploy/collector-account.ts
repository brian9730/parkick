import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '../backend/src/generated/prisma/client.js';
import { hashPassword } from '../backend/src/services/admin/password.js';

export const collectorAccountSchema = z.strictObject({
  tenantCode: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  name: z.string().trim().min(1).max(80),
});

type CollectorAccountInput = z.infer<typeof collectorAccountSchema>;

/** Only non-secret values are accepted as CLI arguments. */
export function parseCollectorAccountArgs(args: string[]): CollectorAccountInput {
  if (args.length !== 6) throw new Error('Expected --tenant-code, --email, and --name.');
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key || !['--tenant-code', '--email', '--name'].includes(key) || value === undefined || key in values) {
      throw new Error('Invalid or repeated argument.');
    }
    values[key] = value;
  }
  return collectorAccountSchema.parse({
    tenantCode: values['--tenant-code'],
    email: values['--email'],
    name: values['--name'],
  });
}

/** Creates one collector in an existing active tenant; existing accounts are never changed. */
export async function provisionCollectorAccount(client: PrismaClient, rawInput: unknown): Promise<{
  email: string;
  password: string;
}> {
  const input = collectorAccountSchema.parse(rawInput);
  return client.$transaction(async transaction => {
    const tenant = await transaction.tenant.findUnique({
      where: { code: input.tenantCode }, select: { id: true, active: true },
    });
    if (!tenant?.active) throw new Error('Tenant does not exist or is inactive.');

    const existing = await transaction.admin.findMany({
      where: { email: { equals: input.email, mode: 'insensitive' } },
      select: { id: true }, take: 1,
    });
    if (existing.length) throw new Error('Email already belongs to an account.');

    // 32 cryptographically random bytes provide 256 bits of entropy; the plaintext is returned once.
    const password = randomBytes(32).toString('base64url');
    await transaction.admin.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(password),
        name: input.name,
        role: 'COLLECTOR',
        tenantId: tenant.id,
        active: true,
      },
      select: { id: true },
    });
    return { email: input.email, password };
  });
}
