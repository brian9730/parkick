import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { BaseQRParser, type QRIdentifiers } from '../src/services/qr/BaseQRParser.js';
import { OperatorMatcher } from '../src/services/qr/OperatorMatcher.js';
import { QRParsingService } from '../src/services/qr/QRParsingService.js';

const origin = 'http://localhost:5173';
const config: AppConfig = {
  environment: 'test', host: '127.0.0.1', port: 4000, frontendOrigin: origin,
  devAdmin: null, sessionTtlMs: 60_000, ai: { mode: 'disabled' },
};

/** This synthetic format is used only in tests, never as a real operator claim. */
class FixtureParser extends BaseQRParser {
  constructor(readonly id = 'test-fixture') { super(); }

  canParse(rawQr: string): boolean {
    return /^fixture:\/\/provider\.test\/device\/[A-Z0-9-]+$/.test(rawQr);
  }

  protected parseIdentifiers(rawQr: string): QRIdentifiers {
    return { operatorId: 'test-operator', operatorName: 'Test Operator', deviceId: rawQr.split('/').at(-1)! };
  }
}

function expectedUnknown(rawQr: string) {
  return {
    rawQr, operatorId: null, operatorName: null, deviceId: null, parserId: 'generic-unknown',
    matched: false, source: 'unknown', reason: 'UNVERIFIED_QR_FORMAT',
  };
}

describe('QR parser registry and safe manual fallback', () => {
  it('preserves unknown and dangerous-looking payloads exactly without fetching them', (context) => {
    const fetch = context.mock.method(globalThis, 'fetch', () => { throw new Error('QR must not be fetched'); });
    const service = new QRParsingService();
    for (const rawQr of [
      '  unregistered-device-123\n',
      'https://127.0.0.1/admin',
      'http://169.254.169.254/latest/meta-data/',
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'https://provider.example.evil.test/?deviceId=123',
      'fixture://provider.test/device/TEST-42',
    ]) {
      assert.deepEqual(service.parse(rawQr), expectedUnknown(rawQr));
    }
    assert.equal(fetch.mock.callCount(), 0);
  });

  it('uses an explicitly registered parser and rejects lookalike formats', () => {
    const service = new QRParsingService(new OperatorMatcher([new FixtureParser()]));
    const rawQr = 'fixture://provider.test/device/TEST-42';
    assert.deepEqual(service.parse(rawQr), {
      rawQr, operatorId: 'test-operator', operatorName: 'Test Operator', deviceId: 'TEST-42', parserId: 'test-fixture',
      matched: true, source: 'registered-parser', reason: null,
    });
    for (const unknown of [
      'fixture://provider.test.evil/device/TEST-42',
      'fixture://provider.test@evil.test/device/TEST-42',
      'fixture://provider.test/device/TEST-42?redirect=https://evil.test',
    ]) assert.deepEqual(service.parse(unknown), expectedUnknown(unknown));
  });

  it('falls back when rules are ambiguous or a parser fails, and disallows duplicate IDs', () => {
    const rawQr = 'fixture://provider.test/device/TEST-42';
    const registry = new OperatorMatcher([new FixtureParser()]);
    assert.throws(() => registry.register(new FixtureParser()), /unique/);
    assert.throws(() => registry.register(new FixtureParser('generic-unknown')), /unique/);
    registry.register(new FixtureParser('second-fixture'));
    assert.deepEqual(new QRParsingService(registry).parse(rawQr), expectedUnknown(rawQr));
    class BrokenParser extends FixtureParser {
      protected parseIdentifiers(): never { throw new Error('Do not expose this QR parsing failure'); }
    }
    assert.deepEqual(new QRParsingService(new OperatorMatcher([new BrokenParser()])).parse(rawQr), expectedUnknown(rawQr));
  });
});

describe('Phase 2 QR API', () => {
  it('recognizes verified operator formats with display names and device identifiers', async () => {
    const app = await createApp(config);
    for (const fixture of [
      { rawQr: 'https://t.kakao.com/launch?type=bike&ref=qrcode&id=ab1234', operatorId: 'kakao-bike', operatorName: '카카오 T 바이크', deviceId: 'AB1234', parserId: 'kakao-bike-launch-v1' },
      { rawQr: 'https://deeplink.ridebeam.com?code=7654321', operatorId: 'beam', operatorName: '빔', deviceId: '7654321', parserId: 'beam-deeplink-v1' },
      { rawQr: 'https://deeplink.ridebeam.com/?code=AB012', operatorId: 'beam', operatorName: '빔', deviceId: 'AB012', parserId: 'beam-deeplink-v1' },
      { rawQr: 'https://open.gbike.io/?b=1234567890', operatorId: 'gcoo', operatorName: '지쿠', deviceId: null, parserId: 'gcoo-open-v1' },
      { rawQr: 'https://open.gbike.io/?b=08201012345', operatorId: 'gcoo', operatorName: '지쿠', deviceId: '012345', parserId: 'gcoo-open-v1' },
    ]) {
      const response = await request(app).post('/api/qr/parse').set('Origin', origin).send({ rawQr: fixture.rawQr }).expect(200);
      assert.deepEqual(response.body.data, { ...fixture, matched: true, source: 'registered-parser', reason: null });
      assert.equal(response.headers['cache-control'], 'no-store');
    }
  });

  it('uses a selected Beam company for numeric QR while retaining the evidence source', async () => {
    const app = await createApp(config);
    for (const rawQr of ['54321', '01234']) {
      const response = await request(app).post('/api/qr/parse').set('Origin', origin)
        .send({ rawQr, selectedOperatorId: 'beam' }).expect(200);
      assert.deepEqual(response.body.data, {
        rawQr, operatorId: 'beam', operatorName: '빔', deviceId: rawQr,
        parserId: 'beam-numeric-selected-v1', matched: true, source: 'operator-selection', reason: null,
      });
    }
    for (const selectedOperatorId of [undefined, 'gcoo', 'kakao-bike', 'elecle', 'alpaca', 'swing']) {
      const response = await request(app).post('/api/qr/parse').set('Origin', origin)
        .send({ rawQr: '54321', ...(selectedOperatorId ? { selectedOperatorId } : {}) }).expect(200);
      assert.deepEqual(response.body.data, expectedUnknown('54321'));
    }
    const kakaoQr = 'https://t.kakao.com/launch?type=bike&ref=qrcode&id=ab1234';
    const response = await request(app).post('/api/qr/parse').set('Origin', origin)
      .send({ rawQr: kakaoQr, selectedOperatorId: 'beam' }).expect(200);
    assert.equal(response.body.data.operatorId, 'kakao-bike');
    assert.equal(response.body.data.source, 'registered-parser');
  });

  it('accepts only exact catalog IDs as operator selection and rejects extra fields', async () => {
    const app = await createApp(config);
    for (const selectedOperatorId of ['', 'BEAM', '빔', ' beam', 'beam ', 'other', 'unknown', null, 42, [], {}]) {
      const response = await request(app).post('/api/qr/parse').set('Origin', origin)
        .send({ rawQr: '54321', selectedOperatorId }).expect(400);
      assert.equal(response.body.error.code, 'INVALID_INPUT');
    }
    await request(app).post('/api/qr/parse').set('Origin', origin)
      .send({ rawQr: '54321', selectedOperatorId: 'beam', operatorName: '빔' }).expect(400);
  });

  it('returns unknown results for manual entry and reports Phase 5 with storage explicitly disabled', async () => {
    const app = await createApp(config);
    const rawQr = '  https://unknown.example/device/123?secret=value\n';
    const parsed = await request(app).post('/api/qr/parse').set('Origin', origin).send({ rawQr }).expect(200);
    assert.deepEqual(parsed.body, { data: expectedUnknown(rawQr) });
    assert.equal(parsed.headers['cache-control'], 'no-store');
    const health = await request(app).get('/api/health').expect(200);
    assert.equal(health.body.data.phase, 5);
    assert.equal(health.body.data.services.database, 'not-connected');
    await request(app).post('/api/reports').set('Origin', origin).send({}).expect(503);
  });

  it('rejects empty, NUL, oversized and malformed inputs without echoing them', async () => {
    const app = await createApp(config);
    for (const body of [
      {}, { rawQr: '' }, { rawQr: ' \n\t' }, { rawQr: null }, { rawQr: 42 },
      { rawQr: 'secret\0payload' }, { rawQr: 'x'.repeat(4097) },
      { rawQr: 'valid', operatorId: 'forged-operator' },
    ]) {
      const response = await request(app).post('/api/qr/parse').set('Origin', origin).send(body).expect(400);
      assert.equal(response.body.error.code, 'INVALID_INPUT');
      assert.equal(JSON.stringify(response.body).includes('secret'), false);
    }
    await request(app).post('/api/qr/parse').set('Origin', origin).send({ rawQr: 'x'.repeat(4096) }).expect(200);
    const malformed = await request(app).post('/api/qr/parse').set('Origin', origin).set('Content-Type', 'application/json').send('{').expect(400);
    assert.equal(malformed.body.error.code, 'INVALID_JSON');
    await request(app).post('/api/qr/parse').set('Origin', origin).send({ rawQr: 'x'.repeat(20_000) }).expect(413);
  });

  it('requires a trusted Origin and JSON body', async () => {
    const app = await createApp(config);
    await request(app).post('/api/qr/parse').send({ rawQr: 'example' }).expect(403);
    await request(app).post('/api/qr/parse').set('Origin', 'https://untrusted.example').send({ rawQr: 'example' }).expect(403);
    await request(app).post('/api/qr/parse').set('Origin', origin).type('form').send({ rawQr: 'example' }).expect(415);
  });

  it('limits repeated parsing while preserving the standard error envelope', async () => {
    const app = await createApp(config);
    for (let index = 0; index < 30; index += 1) {
      await request(app).post('/api/qr/parse').set('Origin', origin).send({ rawQr: 'unknown' }).expect(200);
    }
    const response = await request(app).post('/api/qr/parse').set('Origin', origin).send({ rawQr: 'unknown' }).expect(429);
    assert.equal(response.body.error.code, 'TOO_MANY_REQUESTS');
    assert.ok(response.body.error.requestId);
    assert.ok(response.headers['retry-after']);
  });
});
