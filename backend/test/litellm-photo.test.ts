import assert from 'node:assert/strict';
import { it } from 'node:test';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { ApiError } from '../src/middleware/errors.js';
import { PhotoValidationService } from '../src/services/reports/PhotoValidationService.js';
import { prepareEvidence } from '../src/services/storage/prepareEvidence.js';

const environment = {
  NODE_ENV: 'test', AI_PROVIDER: 'litellm',
  LLM_API_BASE_URL: 'https://proxy.example/v1', LLM_API_KEY: 'test-only-proxy-key',
  LLM_REPORT_MODEL_ID: 'bedrock-haiku',
};
const config = readConfig(environment);

async function evidence(colors = ['#abcdef']) {
  const files = await Promise.all(colors.map(async (color, index) => ({
    originalname: `${index}.png`, mimetype: 'image/png',
    buffer: await sharp({ create: { width: 1800, height: 1200, channels: 3, background: color } }).png().toBuffer(),
  })));
  return prepareEvidence(files);
}

function completion(labels: string[], finishReason = 'stop', fenced = false): Response {
  const content = JSON.stringify({ labels });
  return Response.json({ choices: [{ finish_reason: finishReason,
    message: { role: 'assistant', content: fenced ? `\`\`\`json\n${content}\n\`\`\`` : content } }] });
}

function hasApiError(code: string, status: number) {
  return (error: unknown) => error instanceof ApiError && error.code === code && error.status === status;
}

it('validates LiteLLM settings and normalizes HTTPS origin or /v1 without revealing secrets', () => {
  assert.deepEqual(readConfig({ ...environment, LLM_API_BASE_URL: 'https://proxy.example' }).ai, config.ai);
  assert.deepEqual(readConfig({ ...environment, LLM_API_BASE_URL: 'https://proxy.example/v1/' }).ai, config.ai);
  assert.deepEqual(readConfig({ ...environment, NODE_ENV: 'production' }).ai, config.ai);
  for (const invalid of ['', 'http://proxy.example', 'https://user:password@proxy.example',
    'https://proxy.example/custom', 'https://proxy.example/?token=private', 'https://proxy.example/#secret']) {
    assert.throws(() => readConfig({ ...environment, LLM_API_BASE_URL: invalid }), (error: unknown) =>
      error instanceof Error && error.message.includes('LLM_API_BASE_URL') && !error.message.includes('private')
        && !error.message.includes('password') && !error.message.includes('secret'));
  }
  for (const name of ['LLM_API_KEY', 'LLM_REPORT_MODEL_ID']) {
    assert.throws(() => readConfig({ ...environment, [name]: '' }), (error: unknown) =>
      error instanceof Error && error.message.includes(name) && !error.message.includes(environment.LLM_API_KEY));
  }
});

it('sends bounded JPEGs to /v1/chat/completions, parses fenced labels and caches success', async () => {
  const photos = await evidence(['#abcdef', '#fedcba']);
  let requests = 0;
  const validator = PhotoValidationService.create(config, undefined, undefined, async (url, init) => {
    requests += 1;
    assert.equal(url, 'https://proxy.example/v1/chat/completions');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    const headers = new Headers(init.headers);
    assert.equal(headers.get('x-litellm-api-key'), environment.LLM_API_KEY);
    assert.equal(headers.get('content-type'), 'application/json');
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'bedrock-haiku');
    assert.equal(body.temperature, 0);
    assert.equal(body.max_tokens, 120);
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0].role, 'system');
    assert.match(body.messages[0].content, /shared electric scooter/);
    assert.equal(body.messages[1].role, 'user');
    const content = body.messages[1].content;
    assert.deepEqual(content.map((part: { type: string }) => part.type), ['text', 'text', 'image_url', 'text', 'image_url']);
    for (const part of content.filter((item: { type: string }) => item.type === 'image_url')) {
      const urlValue: string = part.image_url.url;
      assert.match(urlValue, /^data:image\/jpeg;base64,/);
      const bytes = Buffer.from(urlValue.slice('data:image/jpeg;base64,'.length), 'base64');
      assert.ok(bytes.length > 0 && bytes.length < 3 * 1024 * 1024);
      const metadata = await sharp(bytes).metadata();
      assert.ok((metadata.width ?? 0) <= 1600 && (metadata.height ?? 0) <= 1600);
      assert.equal(metadata.exif, undefined);
    }
    return completion(['related', 'uncertain'], 'stop', true);
  });
  await validator.validate(photos);
  await validator.validate(photos);
  assert.equal(requests, 1);
  assert.equal(validator.mode, 'litellm');
  assert.equal(validator.configured, true);
});

it('accepts a complete leading JSON fence followed by prose, but still validates its labels', async () => {
  const photos = await evidence();
  const reply = (content: string) => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] });
  const valid = PhotoValidationService.create(config, undefined, undefined, async () =>
    reply('```json\n{"labels":["related"]}\n```\nThe photo shows a scooter.'));
  await valid.validate(photos);
  const wrongCount = PhotoValidationService.create(config, undefined, undefined, async () =>
    reply('```json\n{"labels":["related","related"]}\n```\nThe photo shows a scooter.'));
  await assert.rejects(wrongCount.validate(photos), hasApiError('PHOTO_VALIDATION_UNAVAILABLE', 503));
  const incompleteFence = PhotoValidationService.create(config, undefined, undefined, async () =>
    reply('```json\n{"labels":["related"]}\nThe photo shows a scooter.'));
  await assert.rejects(incompleteFence.validate(photos), hasApiError('PHOTO_VALIDATION_UNAVAILABLE', 503));
});

it('fails closed on unrelated or inconclusive evidence and never caches failure', async () => {
  const photos = await evidence();
  let requests = 0;
  const validator = PhotoValidationService.create(config, undefined, undefined, async () => {
    requests += 1;
    if (requests === 1) return completion(['unrelated']);
    if (requests === 2) return completion(['uncertain']);
    return completion(['related']);
  });
  await assert.rejects(validator.validate(photos), hasApiError('PHOTO_NOT_PM', 422));
  await assert.rejects(validator.validate(photos), hasApiError('PHOTO_NOT_PM', 422));
  await validator.validate(photos);
  await validator.validate(photos);
  assert.equal(requests, 3);
});

it('maps proxy errors, truncated completions and malformed labels to a generic 503', async () => {
  const photos = await evidence();
  const badResponses = [
    new Response('private upstream failure', { status: 503 }),
    Response.json({ choices: [] }),
    completion(['related'], 'length'),
    Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'not-json' } }] }),
    completion(['related', 'unrelated']),
  ];
  for (const response of badResponses) {
    const validator = PhotoValidationService.create(config, undefined, undefined, async () => response);
    await assert.rejects(validator.validate(photos), (error: unknown) =>
      hasApiError('PHOTO_VALIDATION_UNAVAILABLE', 503)(error)
      && error instanceof Error && !error.message.includes('private') && !error.message.includes(environment.LLM_API_KEY));
  }
  const failed = PhotoValidationService.create(config, undefined, undefined, async () => {
    throw new Error(`private transport ${environment.LLM_API_KEY}`);
  });
  await assert.rejects(failed.validate(photos), hasApiError('PHOTO_VALIDATION_UNAVAILABLE', 503));
});

it('aborts the proxy request on timeout even if the sender ignores cancellation', async () => {
  const photos = await evidence();
  let signal: AbortSignal | null = null;
  const validator = PhotoValidationService.create(config, undefined, 250, async (_url, init) => {
    signal = init.signal as AbortSignal;
    return new Promise<Response>(() => {});
  });
  await assert.rejects(validator.validate(photos), hasApiError('PHOTO_VALIDATION_UNAVAILABLE', 503));
  assert.equal(signal?.aborted, true);
});

it('wires LiteLLM into the photo preflight endpoint and reports its mode', async () => {
  const app = await createApp(config, { liteLlmSender: async () => completion(['related']) });
  try {
    const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#abcdef' } }).jpeg().toBuffer();
    const result = await request(app).post('/api/reports/validate-photos').set('Origin', 'http://localhost:5173')
      .attach('photos', jpeg, { filename: 'scene.jpg', contentType: 'image/jpeg' }).expect(200);
    assert.deepEqual(result.body.data, { valid: true, photoValidation: 'litellm' });
    const health = await request(app).get('/api/health').expect(200);
    assert.equal(health.body.data.services.photoValidation, 'litellm');
  } finally { await app.closeResources(); }
});
