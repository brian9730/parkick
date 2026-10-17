import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { before, describe, it, type TestContext } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig, type AppConfig } from '../src/config.js';
import { ApiError } from '../src/middleware/errors.js';
import type { AdminAuthRepositories } from '../src/repositories/PrismaAdminAuthRepository.js';
import type { AdminRepository } from '../src/repositories/AdminRepository.js';
import type { SessionRepository } from '../src/repositories/SessionRepository.js';
import { AdminAuthService } from '../src/services/admin/AdminAuthService.js';
import { hashPassword } from '../src/services/admin/password.js';
import type { AdminRecord, AdminSession } from '../src/types/admin.js';

const origin = 'https://parkick.example';
const email = 'database-admin@example.test';
const password = randomBytes(24).toString('base64url');
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
let passwordHash: string;
before(async () => { passwordHash = await hashPassword(password); });

function configuration(): AppConfig {
  return readConfig({
    NODE_ENV: 'production', AI_PROVIDER: 'disabled', FRONTEND_ORIGIN: origin,
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
    REPORT_STORAGE_PROVIDER: 'local', REPORT_STORAGE_DIR: resolve('data/admin-auth-test-unused'),
    PHONE_ENCRYPTION_KEY: randomBytes(32).toString('base64'), PHONE_LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
  });
}

class MemoryAuthRepositories implements AdminAuthRepositories, AdminRepository, SessionRepository {
  readonly admins = this;
  readonly sessions = this;
  readonly records = new Map<string, AdminSession>();
  account: AdminRecord = { id: randomUUID(), email, name: 'DB 관리자', passwordHash, active: true, role: 'PLATFORM_ADMIN', tenantId: null };
  failAt: 'email' | 'id' | 'find' | 'save' | 'delete' | null = null;
  saveGate?: Promise<void>;
  deleteGate?: Promise<void>;
  saveStarted = false;
  deleteStarted = false;
  closed = false;
  private fail(operation: MemoryAuthRepositories['failAt']) {
    if (this.failAt === operation) throw new Error('PRIVATE_DB_URL_AND_PASSWORD_SENTINEL');
  }
  async findByEmail(value: string) { this.fail('email'); return value === this.account.email ? this.account : null; }
  async findById(id: string) { this.fail('id'); return id === this.account.id ? this.account : null; }
  async find(hash: string) { this.fail('find'); return this.records.get(hash) ?? null; }
  async save(session: AdminSession) {
    this.fail('save'); this.saveStarted = true;
    await this.saveGate;
    this.records.set(session.tokenHash, session);
  }
  async delete(hash: string) {
    this.fail('delete'); this.deleteStarted = true;
    await this.deleteGate;
    const session = this.records.get(hash);
    if (session) session.revokedAt = Date.now();
  }
  async close() { this.closed = true; }
}

function cookie(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  assert.ok(Array.isArray(value));
  return (value[0] as string).split(';')[0]!;
}

async function fixture(t: TestContext) {
  const repositories = new MemoryAuthRepositories();
  const app = await createApp(configuration(), { adminAuthRepositories: repositories });
  t.after(() => app.closeResources());
  const login = (body: unknown = { email, password }) => request(app).post('/api/admin/auth/login').set('Origin', origin).send(body);
  return { app, repositories, login };
}

const hasError = (status: number, code: string) => (error: unknown) => error instanceof ApiError && error.status === status && error.code === code;

describe('Database admin authentication', () => {
  it('returns the stored scope, protects the cookie and persists only its digest without exposing secrets', async t => {
    const { app, repositories, login } = await fixture(t);
    const response = await login({ email: email.toUpperCase(), password }).expect(200);
    const sessionCookie = cookie(response);
    const token = sessionCookie.split('=')[1]!;
    assert.equal(response.body.data.mode, 'database');
    assert.deepEqual(response.body.data.admin, { id: repositories.account.id, email, name: 'DB 관리자', role: 'PLATFORM_ADMIN', tenantId: null });
    assert.equal(response.headers['cache-control'], 'no-store');
    for (const flag of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/api/admin']) assert.ok(String(response.headers['set-cookie']).includes(flag));
    assert.ok(repositories.records.has(digest(token)));
    for (const secret of [password, passwordHash, token, 'passwordHash', 'active']) assert.equal(JSON.stringify(response.body).includes(secret), false);
    assert.equal(JSON.stringify([...repositories.records.values()]).includes(token), false);
    const me = await request(app).get('/api/admin/auth/me').set('Cookie', sessionCookie).expect(200);
    assert.deepEqual(me.body, response.body);
    await app.closeResources();
    assert.equal(repositories.closed, true);
  });

  it('rejects unknown, invalid, inactive and unscoped accounts uniformly without creating a session', async () => {
    const repositories = new MemoryAuthRepositories();
    const service = await AdminAuthService.create(configuration(), repositories);
    await assert.rejects(service.login('missing@example.test', password), hasError(401, 'INVALID_CREDENTIALS'));
    await assert.rejects(service.login(email, 'incorrect'), hasError(401, 'INVALID_CREDENTIALS'));
    repositories.account.active = false;
    await assert.rejects(service.login(email, password), hasError(401, 'INVALID_CREDENTIALS'));
    repositories.account.active = true;
    delete repositories.account.role;
    await assert.rejects(service.login(email, password), hasError(401, 'INVALID_CREDENTIALS'));
    repositories.account.role = 'TENANT_ADMIN';
    await assert.rejects(service.login(email, password), hasError(401, 'INVALID_CREDENTIALS'));
    repositories.account.role = 'PLATFORM_ADMIN';
    repositories.account.tenantId = randomUUID();
    await assert.rejects(service.login(email, password), hasError(401, 'INVALID_CREDENTIALS'));
    assert.equal(repositories.records.size, 0);
  });

  it('retains tenant scope and rechecks active account, expiration and revocation on every authentication', async () => {
    const repositories = new MemoryAuthRepositories();
    repositories.account.role = 'TENANT_ADMIN'; repositories.account.tenantId = randomUUID();
    const service = await AdminAuthService.create(configuration(), repositories);
    const loggedIn = await service.login(email, password);
    assert.equal(loggedIn.admin.role, 'TENANT_ADMIN');
    assert.equal(loggedIn.admin.tenantId, repositories.account.tenantId);
    const session = repositories.records.get(digest(loggedIn.token))!;
    repositories.account.active = false;
    await assert.rejects(service.authenticate(loggedIn.token), hasError(401, 'UNAUTHENTICATED'));
    repositories.account.active = true;
    session.expiresAt = Date.now() - 1;
    await assert.rejects(service.authenticate(loggedIn.token), hasError(401, 'UNAUTHENTICATED'));
    session.expiresAt = Date.now() + 60_000;
    session.revokedAt = Date.now();
    await assert.rejects(service.authenticate(loggedIn.token), hasError(401, 'UNAUTHENTICATED'));
    for (const token of [undefined, '', 'invalid', 'x'.repeat(43)]) await assert.rejects(service.authenticate(token), hasError(401, 'UNAUTHENTICATED'));
  });

  it('waits for session persistence and previous-session revocation before completing login or logout', async () => {
    const repositories = new MemoryAuthRepositories();
    const service = await AdminAuthService.create(configuration(), repositories);
    let releaseSave!: () => void;
    repositories.saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
    let completed = false;
    const pendingLogin = service.login(email, password).then(result => { completed = true; return result; });
    while (!repositories.saveStarted) await setImmediate();
    assert.equal(completed, false);
    assert.equal(repositories.records.size, 0);
    releaseSave();
    const first = await pendingLogin;
    let releaseDelete!: () => void;
    repositories.deleteGate = new Promise<void>(resolve => { releaseDelete = resolve; });
    completed = false;
    const rotation = service.login(email, password, first.token).then(result => { completed = true; return result; });
    while (!repositories.deleteStarted) await setImmediate();
    assert.equal(completed, false);
    assert.equal(repositories.records.size, 1);
    releaseDelete();
    const second = await rotation;
    await assert.rejects(service.authenticate(first.token), hasError(401, 'UNAUTHENTICATED'));
    assert.equal((await service.authenticate(second.token)).id, repositories.account.id);
    repositories.deleteStarted = false;
    repositories.deleteGate = new Promise<void>(resolve => { releaseDelete = resolve; });
    completed = false;
    const logout = service.logout(second.token).then(() => { completed = true; });
    while (!repositories.deleteStarted) await setImmediate();
    assert.equal(completed, false);
    releaseDelete(); await logout;
    await assert.rejects(service.authenticate(second.token), hasError(401, 'UNAUTHENTICATED'));
  });

  it('returns a private, uncached 503 for database failures and never reports logout success before revocation', async t => {
    const { app, repositories, login } = await fixture(t);
    const loggedIn = await login().expect(200);
    const sessionCookie = cookie(loggedIn);
    const errors = t.mock.method(console, 'error', () => {});
    for (const operation of ['email', 'save', 'find', 'id', 'delete'] as const) {
      repositories.failAt = operation;
      const response = await (operation === 'email' || operation === 'save' ? login()
        : operation === 'delete' ? request(app).post('/api/admin/auth/logout').set('Origin', origin).set('Cookie', sessionCookie).send({})
          : request(app).get('/api/admin/auth/me').set('Cookie', sessionCookie)).expect(503);
      assert.equal(response.body.error.code, 'ADMIN_AUTH_UNAVAILABLE');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['set-cookie'], undefined);
      assert.equal(JSON.stringify(response.body).includes('PRIVATE_'), false);
    }
    assert.equal(errors.mock.callCount(), 0);
    repositories.failAt = null;
    await request(app).get('/api/admin/auth/me').set('Cookie', sessionCookie).expect(200);
  });

  it('preserves explicit local mock mode and ignores injected development credentials in production', async () => {
    const repositories = new MemoryAuthRepositories();
    const config = configuration();
    config.devAdmin = { email: 'dev@example.test', password, name: '개발 관리자' };
    const production = await AdminAuthService.create(config, repositories);
    assert.equal(production.mode, 'database');
    await assert.rejects(production.login(config.devAdmin.email, password), hasError(401, 'INVALID_CREDENTIALS'));
    const development = await AdminAuthService.create({ ...config, environment: 'development' }, repositories);
    assert.equal(development.mode, 'development-mock');
    const loggedIn = await development.login(config.devAdmin.email, password);
    assert.deepEqual(Object.keys(loggedIn.admin).sort(), ['email', 'id', 'name']);
    assert.equal(repositories.records.size, 0);
    await assert.rejects(development.login(email, password), hasError(401, 'INVALID_CREDENTIALS'));
  });
});
