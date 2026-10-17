import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AppConfig } from '../../config.js';
import { ApiError } from '../../middleware/errors.js';
import { MockAdminRepository, type AdminRepository } from '../../repositories/AdminRepository.js';
import { MockSessionRepository, type SessionRepository } from '../../repositories/SessionRepository.js';
import { PrismaAdminAuthRepository, type AdminAuthRepositories } from '../../repositories/PrismaAdminAuthRepository.js';
import type { AdminProfile, AdminRecord } from '../../types/admin.js';
import { hashPassword, verifyPassword } from './password.js';

function profile(admin: AdminRecord): AdminProfile {
  return {
    id: admin.id, email: admin.email, name: admin.name,
    ...(admin.role ? { role: admin.role, tenantId: admin.tenantId ?? null } : {}),
  };
}

function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const validToken = (token: string | undefined): token is string => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
function unavailable(): ApiError {
  return new ApiError(503, 'ADMIN_AUTH_UNAVAILABLE', '관리자 인증을 잠시 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
}

export class AdminAuthService {
  private constructor(
    private readonly admins: AdminRepository | null,
    private readonly sessions: SessionRepository,
    private readonly dummyHash: string,
    private readonly sessionTtlMs: number,
    readonly mode: 'database' | 'development-mock' | 'disabled',
    private readonly databaseRepositories?: AdminAuthRepositories,
  ) {}

  static async create(config: AppConfig, databaseRepositories?: AdminAuthRepositories): Promise<AdminAuthService> {
    // Check here as well as in config parsing so dependency injection cannot enable it in production.
    const enabled = config.environment !== 'production' && config.devAdmin !== null;
    const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
    if (!enabled && config.reports?.databaseUrl) {
      const repositories = databaseRepositories ?? new PrismaAdminAuthRepository(config.reports.databaseUrl);
      return new AdminAuthService(repositories.admins, repositories.sessions, dummyHash, config.sessionTtlMs, 'database', repositories);
    }
    const account = enabled && config.devAdmin ? new MockAdminRepository({
      id: randomUUID(),
      email: config.devAdmin.email,
      name: config.devAdmin.name,
      passwordHash: await hashPassword(config.devAdmin.password),
      active: true,
    }) : null;
    return new AdminAuthService(account, new MockSessionRepository(), dummyHash, config.sessionTtlMs, account ? 'development-mock' : 'disabled');
  }

  private allowed(admin: AdminRecord | null): admin is AdminRecord {
    if (!admin?.active) return false;
    if (this.mode !== 'database') return true;
    // Never infer platform privileges from a missing role or tenant association.
    return (admin.role === 'PLATFORM_ADMIN' && admin.tenantId === null)
      || (admin.role === 'TENANT_ADMIN' && typeof admin.tenantId === 'string' && admin.tenantId.length > 0);
  }

  async login(email: string, password: string, previousToken?: string): Promise<{ admin: AdminProfile; token: string }> {
    if (!this.admins) {
      throw new ApiError(503, 'ADMIN_AUTH_NOT_CONFIGURED', '관리자 인증이 준비되지 않았습니다. 서버 설정을 확인해주세요.');
    }
    try {
      const admin = await this.admins.findByEmail(email.trim().toLowerCase());
      const valid = await verifyPassword(password, this.allowed(admin) ? admin.passwordHash : this.dummyHash);
      if (!this.allowed(admin) || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인해주세요.');
      if (previousToken) await this.logout(previousToken);
      const token = randomBytes(32).toString('base64url');
      await this.sessions.save({ tokenHash: tokenDigest(token), adminId: admin.id, expiresAt: Date.now() + this.sessionTtlMs, revokedAt: null });
      return { admin: profile(admin), token };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw unavailable();
    }
  }

  async authenticate(token: string | undefined): Promise<AdminProfile> {
    if (!this.admins || !validToken(token)) {
      throw new ApiError(401, 'UNAUTHENTICATED', '관리자 로그인이 필요합니다.');
    }
    try {
      const session = await this.sessions.find(tokenDigest(token));
      const activeSession = session && session.revokedAt === null && session.expiresAt > Date.now();
      const admin = activeSession ? await this.admins.findById(session.adminId) : null;
      if (!this.allowed(admin)) throw new ApiError(401, 'UNAUTHENTICATED', '관리자 로그인이 필요합니다.');
      return profile(admin);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw unavailable();
    }
  }

  async logout(token: string | undefined): Promise<void> {
    if (!validToken(token)) return;
    try { await this.sessions.delete(tokenDigest(token)); }
    catch { throw unavailable(); }
  }

  async close(): Promise<void> { await this.databaseRepositories?.close(); }
}
