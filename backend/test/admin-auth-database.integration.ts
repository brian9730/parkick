import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it, type TestContext } from 'node:test';
import request from 'supertest';
import { assertTaskLocalDatabase, localTestDatabaseUrl } from '../scripts/local-database.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword } from '../src/services/admin/password.js';

// Only a dedicated loopback test DB is allowed; never load credentials from the user's .env.
const databaseUrl = process.env.TEST_DATABASE_URL || localTestDatabaseUrl;
assertTaskLocalDatabase(databaseUrl, true);
assert.equal(new URL(databaseUrl).pathname, '/parkick_test');
const client = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
const origin = 'https://parkick.example';
const password = randomBytes(24).toString('base64url');
let passwordHash: string;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

function cookie(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  assert.ok(Array.isArray(value));
  return (value[0] as string).split(';')[0]!;
}

async function fixture(t: TestContext, tenantScoped = false) {
  const adminId = randomUUID();
  const email = `auth-${adminId}@test.invalid`;
  const tenantId = tenantScoped ? randomUUID() : null;
  const tenantCode = `auth-test-${adminId}`;
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  // Fixtures must be committed to test independent clients and process restart behavior.
  // Cleanup is restricted to exact generated IDs + unique fixture emails/codes, never whole tables.
  t.after(async () => {
    for (const app of apps) await app.closeResources();
    await client.admin.deleteMany({ where: { id: adminId, email } });
    assert.equal(await client.adminSession.count({ where: { adminId } }), 0);
    if (tenantId) await client.tenant.deleteMany({ where: { id: tenantId, code: tenantCode } });
  });
  if (tenantId) await client.tenant.create({ data: { id: tenantId, code: tenantCode, name: '인증 통합 테스트 전용' } });
  await client.admin.create({ data: {
    id: adminId, email, name: '인증 통합 테스트 관리자', passwordHash,
    role: tenantScoped ? 'TENANT_ADMIN' : 'PLATFORM_ADMIN', tenantId,
  } });
  const config = readConfig({
    NODE_ENV: 'test', AI_PROVIDER: 'disabled', FRONTEND_ORIGIN: origin, DATABASE_URL: databaseUrl,
    PHONE_ENCRYPTION_KEY: randomBytes(32).toString('base64'), PHONE_LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
  });
  const start = async () => { const app = await createApp(config); apps.push(app); return app; };
  const login = (app: Awaited<ReturnType<typeof createApp>>, sessionCookie?: string, credentials = { email, password }) => {
    const operation = request(app).post('/api/admin/auth/login').set('Origin', origin).send(credentials);
    return sessionCookie ? operation.set('Cookie', sessionCookie) : operation;
  };
  return { adminId, email, tenantId, start, login };
}

describe('PostgreSQL admin authentication (isolated committed fixtures in dedicated test DB)', () => {
  before(async () => { await client.$connect(); passwordHash = await hashPassword(password); });
  after(async () => { await client.$disconnect(); });

  it('authenticates a database account across application restarts and persists only hashed session tokens', async t => {
    const { adminId, email, start, login } = await fixture(t);
    const firstApp = await start();
    const response = await login(firstApp).expect(200);
    const sessionCookie = cookie(response);
    const token = sessionCookie.split('=')[1]!;
    assert.equal(response.body.data.mode, 'database');
    assert.deepEqual(response.body.data.admin, { id: adminId, email, name: '인증 통합 테스트 관리자', role: 'PLATFORM_ADMIN', tenantId: null });
    const rows = await client.adminSession.findMany({ where: { adminId } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.tokenHash, digest(token));
    assert.equal(rows[0]?.revokedAt, null);
    assert.ok(rows[0]!.expiresAt.getTime() > Date.now());
    assert.equal(JSON.stringify(rows).includes(token), false);
    assert.equal(JSON.stringify(response.body).includes(passwordHash), false);
    await firstApp.closeResources();
    const restartedApp = await start();
    const me = await request(restartedApp).get('/api/admin/auth/me').set('Cookie', sessionCookie).expect(200);
    assert.deepEqual(me.body, response.body);
    assert.equal(me.headers['cache-control'], 'no-store');

    const rotated = await login(restartedApp, sessionCookie).expect(200);
    const nextCookie = cookie(rotated);
    assert.notEqual(nextCookie, sessionCookie);
    const previous = await client.adminSession.findUniqueOrThrow({ where: { tokenHash: digest(token) } });
    assert.ok(previous.revokedAt);
    await request(restartedApp).get('/api/admin/auth/me').set('Cookie', sessionCookie).expect(401);
    await restartedApp.closeResources();
    const thirdApp = await start();
    await request(thirdApp).get('/api/admin/auth/me').set('Cookie', nextCookie).expect(200);
    const logout = await request(thirdApp).post('/api/admin/auth/logout').set('Origin', origin).set('Cookie', nextCookie).send({}).expect(204);
    assert.match(String(logout.headers['set-cookie']), /Max-Age=0/);
    const active = await client.adminSession.count({ where: { adminId, revokedAt: null } });
    assert.equal(active, 0);
    await thirdApp.closeResources();
    const fourthApp = await start();
    await request(fourthApp).get('/api/admin/auth/me').set('Cookie', nextCookie).expect(401);
  });

  it('rejects inactive admins, expired or revoked sessions, wrong passwords and unknown accounts', async t => {
    const { adminId, email, start, login } = await fixture(t);
    const app = await start();
    const wrong = await login(app, undefined, { email, password: 'incorrect' }).expect(401);
    const unknownEmail = `missing-${randomUUID()}@test.invalid`;
    const missing = await login(app, undefined, { email: unknownEmail, password }).expect(401);
    assert.equal(wrong.body.error.code, missing.body.error.code);
    assert.equal(await client.admin.count({ where: { email: unknownEmail } }), 0);
    assert.equal(await client.adminSession.count({ where: { adminId } }), 0);
    const loggedIn = await login(app).expect(200);
    const sessionCookie = cookie(loggedIn);
    const hash = digest(sessionCookie.split('=')[1]!);
    await client.admin.update({ where: { id: adminId }, data: { active: false } });
    const inactive = await login(app).expect(401);
    assert.equal(inactive.body.error.code, wrong.body.error.code);
    await request(app).get('/api/admin/auth/me').set('Cookie', sessionCookie).expect(401);
    await client.admin.update({ where: { id: adminId }, data: { active: true } });
    await request(app).get('/api/admin/auth/me').set('Cookie', sessionCookie).expect(200);
    await client.adminSession.update({ where: { tokenHash: hash }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await request(app).get('/api/admin/auth/me').set('Cookie', sessionCookie).expect(401);
    await client.adminSession.update({ where: { tokenHash: hash }, data: { expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() } });
    await request(app).get('/api/admin/auth/me').set('Cookie', sessionCookie).expect(401);
    await request(app).get('/api/admin/auth/me').set('Cookie', `parkick_admin_session=${'x'.repeat(43)}`).expect(401);
  });

  it('preserves an explicitly stored tenant role and tenant association without platform elevation', async t => {
    const { tenantId, start, login } = await fixture(t, true);
    const app = await start();
    const loggedIn = await login(app).expect(200);
    assert.equal(loggedIn.body.data.admin.role, 'TENANT_ADMIN');
    assert.equal(loggedIn.body.data.admin.tenantId, tenantId);
    await app.closeResources();
    const restarted = await start();
    const me = await request(restarted).get('/api/admin/auth/me').set('Cookie', cookie(loggedIn)).expect(200);
    assert.equal(me.body.data.admin.role, 'TENANT_ADMIN');
    assert.equal(me.body.data.admin.tenantId, tenantId);
  });
});
