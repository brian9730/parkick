import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { trustedFrontendOrigins } from '../src/middleware/security.js';

const password = randomBytes(24).toString('base64url');
const email = 'origin-test@example.invalid';

function configuration(frontendOrigin: string, environment: AppConfig['environment'] = 'development'): AppConfig {
  return {
    environment, frontendOrigin, host: '127.0.0.1', port: 4000,
    devAdmin: { email, password, name: '출처 검사 계정' }, sessionTtlMs: 60_000, ai: { mode: 'disabled' },
  };
}

function extractCookie(headers: Record<string, unknown>): string {
  const cookies = headers['set-cookie'];
  assert.ok(Array.isArray(cookies));
  assert.equal(typeof cookies[0], 'string');
  return (cookies[0] as string).split(';')[0]!;
}

describe('development frontend loopback origins', () => {
  it('expands only exact development loopback hosts while preserving scheme and port', () => {
    assert.deepEqual(
      [...trustedFrontendOrigins({ environment: 'development', frontendOrigin: 'https://localhost:8443' })].sort(),
      ['https://127.0.0.1:8443', 'https://localhost:8443'],
    );
    for (const frontendOrigin of ['https://parkick.example', 'http://0.0.0.0:5173', 'http://127.0.0.2:5173', 'http://localhost.evil.test:5173']) {
      assert.deepEqual([...trustedFrontendOrigins({ environment: 'development', frontendOrigin })], [frontendOrigin]);
    }
    for (const environment of ['test', 'production'] as const) {
      const frontendOrigin = 'http://localhost:5173';
      assert.deepEqual([...trustedFrontendOrigins({ environment, frontendOrigin })], [frontendOrigin]);
    }
  });

  for (const [configuredOrigin, browserOrigin] of [
    ['http://localhost:5173', 'http://127.0.0.1:5173'],
    ['http://127.0.0.1:5173', 'http://localhost:5173'],
  ] as const) {
    it(`supports preflight, authentication and QR from ${browserOrigin} when configured as ${configuredOrigin}`, async () => {
      const app = await createApp(configuration(configuredOrigin));
      const preflight = await request(app).options('/api/admin/auth/login')
        .set('Origin', browserOrigin).set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type').expect(204);
      assert.equal(preflight.headers['access-control-allow-origin'], browserOrigin);
      assert.equal(preflight.headers['access-control-allow-credentials'], 'true');

      const login = await request(app).post('/api/admin/auth/login')
        .set('Origin', browserOrigin).send({ email, password }).expect(200);
      assert.equal(login.headers['access-control-allow-origin'], browserOrigin);
      assert.match(String(login.headers['set-cookie']), /HttpOnly/);
      assert.match(String(login.headers['set-cookie']), /SameSite=Strict/);
      assert.match(String(login.headers['set-cookie']), /Path=\/api\/admin/);
      assert.doesNotMatch(String(login.headers['set-cookie']), /Domain=/i);
      const cookie = extractCookie(login.headers);
      const me = await request(app).get('/api/admin/auth/me')
        .set('Origin', browserOrigin).set('Cookie', cookie).expect(200);
      assert.equal(me.body.data.admin.email, email);

      const qr = await request(app).post('/api/qr/parse')
        .set('Origin', browserOrigin).send({ rawQr: 'unknown-device' }).expect(200);
      assert.equal(qr.body.data.matched, false);
      await request(app).post('/api/qr/parse').set('Origin', browserOrigin)
        .type('form').send({ rawQr: 'unknown-device' }).expect(415);
      await request(app).get('/api/admin/dashboard').set('Origin', browserOrigin).expect(401);

      await request(app).post('/api/admin/auth/logout').set('Origin', browserOrigin)
        .set('Cookie', cookie).send({}).expect(204);
      await request(app).get('/api/admin/auth/me').set('Origin', browserOrigin)
        .set('Cookie', cookie).expect(401);
    });
  }

  it('rejects other ports, schemes, lookalikes, malformed or absent origins and forged proxy headers', async () => {
    const app = await createApp(configuration('http://localhost:5173'));
    for (const origin of [
      'http://127.0.0.1:5174', 'https://127.0.0.1:5173',
      'http://localhost.evil.test:5173', 'http://localhost.:5173',
      'http://127.0.0.2:5173', 'http://127.1:5173',
      'http://user@localhost:5173', 'http://localhost:5173/path', 'null',
    ]) {
      const response = await request(app).post('/api/qr/parse')
        .set('Origin', origin).send({ rawQr: 'unknown-device' }).expect(403);
      assert.equal(response.body.error.code, 'UNTRUSTED_ORIGIN');
      assert.equal(response.headers['access-control-allow-origin'], undefined);
    }
    for (const origin of [undefined, 'https://untrusted.example']) {
      const attempt = request(app).post('/api/admin/auth/login')
        .set('Host', 'localhost:5173').set('X-Forwarded-Host', '127.0.0.1:5173')
        .set('X-Forwarded-Proto', 'http');
      if (origin) attempt.set('Origin', origin);
      const response = await attempt.send({ email, password }).expect(403);
      assert.equal(response.body.error.code, 'UNTRUSTED_ORIGIN');
    }
  });

  it('retains exact Origin checks for production, test and non-loopback frontend configurations', async () => {
    for (const config of [
      configuration('http://localhost:5173', 'production'),
      configuration('http://localhost:5173', 'test'),
      configuration('https://parkick.example'),
    ]) {
      const app = await createApp(config);
      await request(app).post('/api/qr/parse').set('Origin', config.frontendOrigin)
        .send({ rawQr: 'unknown-device' }).expect(200);
      const denied = await request(app).post('/api/qr/parse').set('Origin', 'http://127.0.0.1:5173')
        .send({ rawQr: 'unknown-device' }).expect(403);
      assert.equal(denied.body.error.code, 'UNTRUSTED_ORIGIN');
      await request(app).options('/api/admin/auth/login').set('Origin', 'http://127.0.0.1:5173')
        .set('Access-Control-Request-Method', 'POST').expect(403);
    }
  });
});
