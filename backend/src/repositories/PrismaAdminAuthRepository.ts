import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AdminRecord, AdminSession } from '../types/admin.js';
import type { AdminRepository } from './AdminRepository.js';
import type { SessionRepository } from './SessionRepository.js';

export interface AdminAuthRepositories {
  admins: AdminRepository;
  sessions: SessionRepository;
  close(): Promise<void>;
}

const adminSelect = {
  id: true, email: true, name: true, passwordHash: true,
  active: true, role: true, tenantId: true,
} satisfies Prisma.AdminSelect;

/** Uses existing accounts only. Account provisioning is deliberately separate from login. */
export class PrismaAdminAuthRepository implements AdminRepository, SessionRepository, AdminAuthRepositories {
  readonly admins: AdminRepository = this;
  readonly sessions: SessionRepository = this;
  private readonly client: Pick<PrismaClient, 'admin' | 'adminSession'>;
  private readonly ownedClient: PrismaClient | undefined;

  constructor(databaseUrl: string, client?: Pick<PrismaClient, 'admin' | 'adminSession'>) {
    this.ownedClient = client ? undefined : new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
    this.client = client ?? this.ownedClient!;
  }

  async findByEmail(email: string): Promise<AdminRecord | null> {
    return this.client.admin.findUnique({ where: { email }, select: adminSelect });
  }

  async findById(id: string): Promise<AdminRecord | null> {
    return this.client.admin.findUnique({ where: { id }, select: adminSelect });
  }

  async find(tokenHash: string): Promise<AdminSession | null> {
    const row = await this.client.adminSession.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { tokenHash: true, adminId: true, expiresAt: true, revokedAt: true },
    });
    return row ? { ...row, expiresAt: row.expiresAt.getTime(), revokedAt: row.revokedAt?.getTime() ?? null } : null;
  }

  async save(session: AdminSession): Promise<void> {
    await this.client.adminSession.create({ data: {
      adminId: session.adminId, tokenHash: session.tokenHash,
      expiresAt: new Date(session.expiresAt), revokedAt: null,
    }, select: { id: true } });
  }

  async delete(tokenHash: string): Promise<void> {
    // Persist revocation across processes; repeated logout is harmless.
    await this.client.adminSession.updateMany({
      where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() },
    });
  }

  async close(): Promise<void> { await this.ownedClient?.$disconnect(); }
}
