import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import request from 'supertest';
import { readConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

const environment = {
  NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://parkick.example',
  DATABASE_URL: 'postgresql://test:password@127.0.0.1:5432/unused',
  REPORT_STORAGE_PROVIDER: 's3', AWS_REGION: 'ap-northeast-2', S3_REPORT_BUCKET: 'parkick-example',
  PHONE_ENCRYPTION_KEY: randomBytes(32).toString('base64'), PHONE_LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
};

describe('AWS storage configuration and local reverse proxy', () => {
  it('enables explicit S3 production intake while keeping development authentication and mock AI disabled', () => {
    const config = readConfig(environment);
    assert.deepEqual(config.reports?.storage, { mode: 's3', region: 'ap-northeast-2', bucket: 'parkick-example', prefix: 'reports' });
    assert.equal(config.devAdmin, null);
    assert.deepEqual(config.ai, { mode: 'disabled' });
    assert.throws(() => readConfig({ ...environment, ENABLE_DEV_ADMIN: 'true' }), /MOCK/);
    assert.throws(() => readConfig({ ...environment, AI_PROVIDER: 'mock' }), /MOCK/);
  });

  it('keeps S3 in Seoul when the AI region is Virginia', () => {
    const config = readConfig({ ...environment, AI_PROVIDER: 'bedrock', BEDROCK_REGION: 'us-east-1', BEDROCK_REPORT_MODEL_ID: 'test-model' });
    assert.deepEqual(config.ai, { mode: 'bedrock', region: 'us-east-1', modelId: 'test-model' });
    assert.deepEqual(config.reports?.storage, { mode: 's3', region: 'ap-northeast-2', bucket: 'parkick-example', prefix: 'reports' });
    assert.throws(() => readConfig({ ...environment, AWS_REGION: '', BEDROCK_REGION: 'us-east-1' }), /AWS_REGION/);
  });

  it('fails closed for incomplete S3 configuration, unsafe production transport, and invalid object prefixes', () => {
    for (const field of ['DATABASE_URL', 'AWS_REGION', 'S3_REPORT_BUCKET']) {
      assert.throws(() => readConfig({ ...environment, [field]: '' }), /DATABASE_URL.*AWS_REGION.*S3_REPORT_BUCKET/);
    }
    assert.throws(() => readConfig({ ...environment, FRONTEND_ORIGIN: 'http://parkick.example' }), /HTTPS/);
    assert.throws(() => readConfig({ ...environment, DATABASE_URL: 'postgresql://test@127.0.0.1:5432/unused' }), /DATABASE_URL/);
    for (const prefix of ['../reports', '/reports', 'reports/', 'reports//nested']) {
      assert.throws(() => readConfig({ ...environment, S3_REPORT_PREFIX: prefix }), /S3_REPORT_PREFIX/);
    }
    assert.throws(() => readConfig({ ...environment, S3_REPORT_BUCKET: 'https://bucket.example' }), /S3_REPORT_BUCKET/);
    assert.throws(() => readConfig({ ...environment, TRUST_PROXY: 'true' }), /TRUST_PROXY/);
  });

  it('uses the local proxy client IP for limits and preserves production Origin checks', async t => {
    const config = readConfig({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://parkick.example', TRUST_PROXY: 'loopback' });
    const app = await createApp(config);
    t.after(() => app.closeResources());
    assert.equal(app.get('trust proxy'), 'loopback');
    const submit = (ip: string, origin = config.frontendOrigin) => request(app).post('/api/reports')
      .set('Origin', origin).set('X-Forwarded-For', ip).send({});
    for (let attempt = 0; attempt < 10; attempt++) await submit('198.51.100.1').expect(503);
    await submit('198.51.100.1').expect(429);
    await submit('198.51.100.2').expect(503);
    await submit('198.51.100.3', 'https://other.example').expect(403);
  });
});
