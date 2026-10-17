import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig, type AppConfig } from '../src/config.js';

const password = randomBytes(24).toString('base64url');
const email = 'admin@example.test';
const origin = 'http://localhost:5173';

function configuration(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    environment: 'test', host: '127.0.0.1', port: 4000, frontendOrigin: origin,
    devAdmin: { email, password, name: '테스트 관리자' }, sessionTtlMs: 60_000, ai: { mode: 'disabled' },
    ...overrides,
  };
}

function extractCookie(response: { headers: Record<string, unknown> }): string {
  const header = response.headers['set-cookie'];
  assert.ok(Array.isArray(header));
  assert.equal(typeof header[0], 'string');
  return (header[0] as string).split(';')[0]!;
}

describe('Phase 1 API security and honest skeleton responses', () => {
  it('reports readiness truthfully and protects every admin read', async () => {
    const app = await createApp(configuration());
    const health = await request(app).get('/api/health').expect(200);
    assert.equal(health.body.data.services.database, 'not-connected');
    assert.equal(health.headers['cache-control'], 'no-store');
    for (const path of ['/auth/me', '/dashboard', '/reports', '/reports/any-id']) {
      const response = await request(app).get(`/api/admin${path}`).expect(401);
      assert.equal(response.body.error.code, 'UNAUTHENTICATED');
      assert.ok(response.body.error.requestId);
    }
    await request(app).patch('/api/admin/reports/any-id/status').set('Origin', origin).send({ status: 'COMPLETED' }).expect(401);
    // Lookup remains unavailable; submission is explicitly disabled without database configuration.
    await request(app).post('/api/report-lookup').set('Origin', origin).send({ phone: '01000000000' }).expect(404);
    await request(app).post('/api/report-lookup/unknown-report').set('Origin', origin).send({ phone: '01000000000' }).expect(404);
    await request(app).post('/api/reports').set('Origin', origin).send({}).expect(503);
  });

  it('logs in, rotates a session, returns no password/token body, and invalidates logout', async () => {
    const app = await createApp(configuration());
    const login = await request(app).post('/api/admin/auth/login').set('Origin', origin).send({ email, password }).expect(200);
    const cookie = extractCookie(login);
    assert.equal(login.body.data.mode, 'development-mock');
    assert.deepEqual(Object.keys(login.body.data.admin).sort(), ['email', 'id', 'name']);
    assert.equal(JSON.stringify(login.body).includes(password), false);
    assert.match(String(login.headers['set-cookie']), /HttpOnly/);
    assert.match(String(login.headers['set-cookie']), /SameSite=Strict/);
    assert.match(String(login.headers['set-cookie']), /Path=\/api\/admin/);
    await request(app).get('/api/admin/auth/me').set('Cookie', cookie).expect(200);
    const dashboard = await request(app).get('/api/admin/dashboard').set('Cookie', cookie).expect(200);
    assert.equal(dashboard.body.data.mode, 'skeleton');
    assert.equal(dashboard.body.data.summary.total, null);
    assert.deepEqual(dashboard.body.data.recentReports, []);
    const reports = await request(app).get('/api/admin/reports?page=2&pageSize=5').set('Cookie', cookie).expect(200);
    assert.deepEqual(reports.body.data, { mode: 'skeleton', items: [], total: 0, page: 2, pageSize: 5 });
    const map = await request(app).get('/api/admin/reports/map').set('Cookie', cookie).expect(200);
    assert.deepEqual(map.body.data, { mode: 'skeleton', items: [], total: 0, page: 1, pageSize: 200 });
    assert.equal(map.headers['cache-control'], 'no-store');
    await request(app).get('/api/admin/reports/any-id').set('Cookie', cookie).expect(501);
    const rotated = await request(app).post('/api/admin/auth/login').set('Origin', origin).set('Cookie', cookie).send({ email, password }).expect(200);
    const nextCookie = extractCookie(rotated);
    assert.notEqual(nextCookie, cookie);
    await request(app).get('/api/admin/auth/me').set('Cookie', cookie).expect(401);
    const logout = await request(app).post('/api/admin/auth/logout').set('Origin', origin).set('Cookie', nextCookie).send({}).expect(204);
    assert.match(String(logout.headers['set-cookie']), /Max-Age=0/);
    await request(app).get('/api/admin/auth/me').set('Cookie', nextCookie).expect(401);
  });

  it('rejects invalid credentials, forged tokens, malformed input and oversized bodies', async () => {
    const app = await createApp(configuration());
    for (const credentials of [{ email, password: 'wrong' }, { email: 'unknown@example.test', password }]) {
      const response = await request(app).post('/api/admin/auth/login').set('Origin', origin).send(credentials).expect(401);
      assert.equal(response.body.error.code, 'INVALID_CREDENTIALS');
    }
    await request(app).get('/api/admin/dashboard').set('Cookie', `parkick_admin_session=${'a'.repeat(43)}`).expect(401);
    await request(app).post('/api/admin/auth/login').set('Origin', origin).send({ email: 'invalid', password }).expect(400);
    await request(app).post('/api/admin/auth/login').set('Origin', origin).send({ email, password, role: 'admin' }).expect(400);
    const malformed = await request(app).post('/api/admin/auth/login').set('Origin', origin).set('Content-Type', 'application/json').send('{').expect(400);
    assert.equal(malformed.body.error.code, 'INVALID_JSON');
    await request(app).post('/api/admin/auth/login').set('Origin', origin).send({ email, password: 'x'.repeat(20_000) }).expect(413);
  });

  it('rejects cross-origin and originless mutations including logout', async () => {
    const app = await createApp(configuration());
    await request(app).post('/api/admin/auth/login').send({ email, password }).expect(403);
    await request(app).post('/api/admin/auth/login').set('Origin', 'https://untrusted.example').send({ email, password }).expect(403);
    await request(app).post('/api/admin/auth/login').set('Origin', origin).type('form').send({ email, password }).expect(415);
    await request(app).post('/api/admin/auth/logout').set('Origin', 'https://untrusted.example').send({}).expect(403);
    const preflight = await request(app).options('/api/admin/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST').expect(204);
    assert.equal(preflight.headers['access-control-allow-origin'], origin);
    assert.equal(preflight.headers['access-control-allow-credentials'], 'true');
  });

  it('rate limits repeated login attempts', async () => {
    const app = await createApp(configuration());
    for (let index = 0; index < 10; index += 1) {
      await request(app).post('/api/admin/auth/login').set('Origin', origin).send({ email, password: '' }).expect(400);
    }
    const response = await request(app).post('/api/admin/auth/login').set('Origin', origin).send({ email, password }).expect(429);
    assert.equal(response.body.error.code, 'TOO_MANY_REQUESTS');
  });

  it('requires explicit development setup and fails closed in production even with injected config', async () => {
    assert.equal(readConfig({}).devAdmin, null);
    assert.throws(() => readConfig({ NODE_ENV: 'production', ENABLE_DEV_ADMIN: 'true', DEV_ADMIN_EMAIL: email, DEV_ADMIN_PASSWORD: password }));
    assert.throws(() => readConfig({ ENABLE_DEV_ADMIN: 'true', DEV_ADMIN_EMAIL: email, DEV_ADMIN_PASSWORD: 'short' }));
    const disabled = await createApp(configuration({ devAdmin: null }));
    await request(disabled).post('/api/admin/auth/login').set('Origin', origin).send({ email, password }).expect(503);
    const production = await createApp(configuration({ environment: 'production' }));
    await request(production).post('/api/admin/auth/login').set('Origin', origin).send({ email, password }).expect(503);
    await request(production).get('/api/admin/dashboard').expect(401);
  });

  it('expires sessions and marks cookies Secure with an HTTPS frontend', async () => {
    const secureOrigin = 'https://localhost:5173';
    const app = await createApp(configuration({ frontendOrigin: secureOrigin, sessionTtlMs: 0 }));
    const login = await request(app).post('/api/admin/auth/login').set('Origin', secureOrigin).send({ email, password }).expect(200);
    assert.match(String(login.headers['set-cookie']), /Secure/);
    await request(app).get('/api/admin/auth/me').set('Cookie', extractCookie(login)).expect(401);
  });
});
