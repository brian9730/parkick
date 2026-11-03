import assert from 'node:assert/strict';
import { it } from 'node:test';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { ApiError } from '../src/middleware/errors.js';
import { PhotoGuidanceService } from '../src/services/reports/PhotoGuidanceService.js';
import { prepareEvidence } from '../src/services/storage/prepareEvidence.js';

const config = readConfig({ NODE_ENV: 'test', AI_PROVIDER: 'bedrock', BEDROCK_REGION: 'us-east-1', BEDROCK_REPORT_MODEL_ID: 'test-vision-model' });
const origin = 'http://localhost:5173';

async function cameraFrame(width = 640, height = 480) {
  const buffer = await sharp({ create: { width, height, channels: 3, background: '#abcdef' } }).jpeg().toBuffer();
  return { originalname: 'frame.jpg', mimetype: 'image/jpeg', buffer };
}

function result(vehicle: string, framing = 'whole', apparentSize = 'adequate', position = 'center'): ConverseCommandOutput {
  return { stopReason: 'end_turn', output: { message: { role: 'assistant', content: [
    { text: JSON.stringify({ vehicle, framing, apparentSize, position }) },
  ] } } } as ConverseCommandOutput;
}

it('sends one metadata-free JPEG to Bedrock and maps structured findings to fixed guidance', async () => {
  const frame = await cameraFrame();
  const [photo] = await prepareEvidence([frame]);
  const findings = [
    result('present'), result('present', 'whole', 'small'), result('present', 'whole', 'adequate', 'off_center'),
    result('present', 'cropped'), result('absent', 'uncertain', 'uncertain', 'uncertain'),
    result('uncertain', 'uncertain', 'uncertain', 'uncertain'),
  ];
  let calls = 0;
  const service = PhotoGuidanceService.create(config, async command => {
    assert.ok(command instanceof ConverseCommand);
    assert.equal(command.input.modelId, 'test-vision-model');
    assert.equal(command.input.inferenceConfig?.maxTokens, 120);
    const images = command.input.messages?.[0]?.content?.flatMap(block => block.image ? [block.image] : []) ?? [];
    assert.equal(images.length, 1);
    assert.equal(images[0]?.format, 'jpeg');
    const metadata = await sharp(Buffer.from(images[0]!.source.bytes!)).metadata();
    assert.equal(metadata.exif, undefined);
    assert.ok((metadata.width ?? 0) <= 1600);
    return findings[calls++]!;
  });
  const expected = ['ready', 'move_closer', 'center_subject', 'show_full_vehicle', 'no_vehicle', 'uncertain'];
  for (const status of expected) {
    const guidance = await service.guide(photo!);
    assert.equal(guidance.status, status);
    assert.ok(guidance.message.length > 0);
  }
  assert.equal(calls, 6);
});

it('fails safely on malformed output, provider failure, and disabled or mock providers', async () => {
  const [photo] = await prepareEvidence([await cameraFrame()]);
  for (const response of [
    { stopReason: 'max_tokens', output: { message: { role: 'assistant', content: [{ text: '{}' }] } } },
    { stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text: '{"vehicle":"present","framing":"whole","apparentSize":"small","position":"move_closer"}' }] } } },
  ]) {
    const service = PhotoGuidanceService.create(config, async () => response as ConverseCommandOutput);
    await assert.rejects(service.guide(photo!), (error: unknown) => error instanceof ApiError && error.code === 'PHOTO_GUIDANCE_UNAVAILABLE');
  }
  const failed = PhotoGuidanceService.create(config, async () => { throw new Error('secret upstream diagnostic'); });
  await assert.rejects(failed.guide(photo!), (error: unknown) =>
    error instanceof ApiError && error.status === 503 && !error.message.includes('secret'));
  const timed = PhotoGuidanceService.create(config, async () => new Promise<ConverseCommandOutput>(() => {}), 80);
  await assert.rejects(timed.guide(photo!), (error: unknown) =>
    error instanceof ApiError && error.status === 503 && error.code === 'PHOTO_GUIDANCE_UNAVAILABLE');
  for (const mode of ['disabled', 'mock'] as const) {
    const unconfigured = PhotoGuidanceService.create(readConfig({ NODE_ENV: 'test', AI_PROVIDER: mode }));
    assert.equal(unconfigured.configured, false);
    await assert.rejects(unconfigured.guide(photo!), (error: unknown) =>
      error instanceof ApiError && error.code === 'PHOTO_GUIDANCE_UNAVAILABLE');
  }
});

it('caps simultaneous model calls independently of the per-minute request limit', async () => {
  const [photo] = await prepareEvidence([await cameraFrame()]);
  let release!: (value: ConverseCommandOutput) => void;
  const held = new Promise<ConverseCommandOutput>(resolve => { release = resolve; });
  let calls = 0;
  const service = PhotoGuidanceService.create(config, async () => { calls += 1; return held; });
  const running = Array.from({ length: 4 }, () => service.guide(photo!));
  await assert.rejects(service.guide(photo!), (error: unknown) =>
    error instanceof ApiError && error.status === 429 && error.code === 'PHOTO_GUIDANCE_BUSY');
  release(result('present'));
  assert.equal((await Promise.all(running)).length, 4);
  assert.equal(calls, 4);
});

it('aborts a canceled model call and immediately frees its concurrency slot', async () => {
  const [photo] = await prepareEvidence([await cameraFrame()]);
  let release!: (value: ConverseCommandOutput) => void;
  const held = new Promise<ConverseCommandOutput>(resolve => { release = resolve; });
  let allStarted!: () => void;
  const started = new Promise<void>(resolve => { allStarted = resolve; });
  const providerSignals: AbortSignal[] = [];
  const service = PhotoGuidanceService.create(config, async (_command, { abortSignal }) => {
    providerSignals.push(abortSignal);
    if (providerSignals.length === 4) allStarted();
    return providerSignals.length <= 4 ? held : result('present');
  });
  const canceled = new AbortController();
  const running = [service.guide(photo!, canceled.signal), service.guide(photo!), service.guide(photo!), service.guide(photo!)];
  await started;
  await assert.rejects(service.guide(photo!), (error: unknown) =>
    error instanceof ApiError && error.code === 'PHOTO_GUIDANCE_BUSY');
  canceled.abort();
  await assert.rejects(running[0], (error: unknown) =>
    error instanceof ApiError && error.code === 'PHOTO_GUIDANCE_UNAVAILABLE');
  assert.equal(providerSignals.filter(signal => signal.aborted).length, 1);
  assert.equal((await service.guide(photo!)).status, 'ready');
  release(result('present'));
  await Promise.all(running.slice(1));
  assert.equal(providerSignals.length, 5);
});

it('accepts one live frame, rejects oversized dimensions and repeated calls before model invocation', async t => {
  let calls = 0;
  const app = await createApp(config, { bedrockSender: async () => { calls += 1; return result('present', 'whole', 'small'); } });
  t.after(() => app.closeResources());
  const frame = await cameraFrame();
  const send = (buffer = frame.buffer, filename = frame.originalname, contentType = frame.mimetype) =>
    request(app).post('/api/reports/photo/live-guidance').set('Origin', origin)
      .attach('photo', buffer, { filename, contentType });
  assert.deepEqual((await send().expect(200)).body.data, {
    status: 'move_closer', message: '기기가 화면에서 작게 보입니다. 조금 가까이 가서 찍어 주세요.',
  });
  assert.equal((await send((await cameraFrame(2000, 1200)).buffer).expect(400)).body.error.code, 'INVALID_PHOTO');
  assert.equal((await send(Buffer.from('not a photo')).expect(400)).body.error.code, 'INVALID_PHOTO');
  assert.equal((await request(app).post('/api/reports/photo/live-guidance').set('Origin', origin)
    .field('extra', 'ignored').attach('photo', frame.buffer, { filename: 'frame.jpg', contentType: 'image/jpeg' }).expect(400)).body.error.code,
  'INVALID_MULTIPART');
  assert.equal(calls, 1);
  for (let index = 0; index < 26; index += 1) await send().expect(200);
  assert.equal((await send().expect(429)).body.error.code, 'TOO_MANY_REQUESTS');
  assert.equal(calls, 27);
});

it('returns 503 before uploading a frame when live AI is not configured', async t => {
  const app = await createApp(readConfig({ NODE_ENV: 'test', AI_PROVIDER: 'disabled' }));
  t.after(() => app.closeResources());
  const frame = await cameraFrame();
  assert.equal((await request(app).post('/api/reports/photo/live-guidance').set('Origin', origin)
    .attach('photo', frame.buffer, { filename: frame.originalname, contentType: frame.mimetype }).expect(503)).body.error.code,
    'PHOTO_GUIDANCE_UNAVAILABLE');
});

it('aborts the provider when the browser closes an in-flight guidance response', async t => {
  let started!: () => void;
  const providerStarted = new Promise<void>(resolve => { started = resolve; });
  let stopped!: () => void;
  const providerStopped = new Promise<void>(resolve => { stopped = resolve; });
  const app = await createApp(config, { timeoutMs: 500,
    bedrockSender: async (_command, { abortSignal }) => {
      abortSignal.addEventListener('abort', stopped, { once: true });
      started();
      return new Promise<ConverseCommandOutput>(() => {});
    },
  });
  const server = app.listen(0);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await app.closeResources();
  });
  const frame = await cameraFrame();
  const pending = request(server).post('/api/reports/photo/live-guidance').set('Origin', origin)
    .attach('photo', frame.buffer, { filename: frame.originalname, contentType: frame.mimetype });
  const settled = pending.then(() => {}, () => {});
  await providerStarted;
  pending.abort();
  await providerStopped;
  await settled;
});

it('uses the configured LiteLLM proxy for camera guidance', async () => {
  const liteConfig = readConfig({ NODE_ENV: 'test', AI_PROVIDER: 'litellm', LLM_API_BASE_URL: 'https://proxy.example/v1',
    LLM_API_KEY: 'test-only-key', LLM_REPORT_MODEL_ID: 'bedrock-haiku' });
  const [photo] = await prepareEvidence([await cameraFrame()]);
  const service = PhotoGuidanceService.create(liteConfig, undefined, undefined, async (url, init) => {
    assert.equal(url, 'https://proxy.example/v1/chat/completions');
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, 'bedrock-haiku');
    assert.equal(body.messages[1].content.filter((part: { type: string }) => part.type === 'image_url').length, 1);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content:
      `\`\`\`json\n${JSON.stringify({ vehicle: 'present', framing: 'whole', apparentSize: 'adequate', position: 'center' })}\n\`\`\`\nThe vehicle is visible.` } }] });
  });
  assert.equal((await service.guide(photo!)).status, 'ready');
});
