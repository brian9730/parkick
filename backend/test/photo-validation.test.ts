import assert from 'node:assert/strict';
import { it } from 'node:test';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import sharp from 'sharp';
import { readConfig } from '../src/config.js';
import { ApiError } from '../src/middleware/errors.js';
import { PhotoValidationService } from '../src/services/reports/PhotoValidationService.js';
import { prepareEvidence } from '../src/services/storage/prepareEvidence.js';

const config = readConfig({
  NODE_ENV: 'test', AI_PROVIDER: 'bedrock', BEDROCK_REGION: 'us-east-1', BEDROCK_REPORT_MODEL_ID: 'test-vision-model',
});

async function evidence(count = 1, color = '#abcdef') {
  const buffer = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: color } }).png().toBuffer();
  return prepareEvidence(Array.from({ length: count }, (_, index) => ({
    originalname: `${index}.png`, mimetype: 'image/png', buffer,
  })));
}

function response(labels: string[]): ConverseCommandOutput {
  return { stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text: JSON.stringify({ labels }) }] } } } as ConverseCommandOutput;
}

it('sends normalized, bounded JPEGs to Converse and accepts a relevant set', async () => {
  let requests = 0;
  const validator = PhotoValidationService.create(config, async command => {
    requests += 1;
    assert.ok(command instanceof ConverseCommand);
    assert.equal(command.input.modelId, 'test-vision-model');
    const content = command.input.messages?.[0]?.content ?? [];
    const images = content.flatMap(block => block.image ? [block.image] : []);
    assert.equal(images.length, 2);
    for (const image of images) {
      assert.equal(image.format, 'jpeg');
      const bytes = Buffer.from(image.source.bytes!);
      assert.ok(bytes.length < 3 * 1024 * 1024);
      const metadata = await sharp(bytes).metadata();
      assert.ok((metadata.width ?? 0) <= 1600);
      assert.ok((metadata.height ?? 0) <= 1600);
      assert.equal(metadata.exif, undefined);
    }
    return response(['related', 'uncertain']);
  });
  await validator.validate(await evidence(2));
  assert.equal(requests, 1);
});

it('reuses only successful ordered photo hashes without retaining image bytes or model output', async () => {
  const [first] = await evidence(1);
  const [second] = await evidence(1, '#fedcba');
  const [changed] = await evidence(1, '#123456');
  let requests = 0;
  const validator = PhotoValidationService.create(config, async command => {
    requests += 1;
    const count = command.input.messages?.[0]?.content?.filter(block => !!block.image).length ?? 0;
    return response(Array.from({ length: count }, () => 'related'));
  });
  await validator.validate([first!, second!]);
  await validator.validate([first!, second!]);
  assert.equal(requests, 1);
  await validator.validate([second!, first!]);
  await validator.validate([first!, changed!]);
  assert.equal(requests, 3);

  const cache = (validator as unknown as { successCache: Map<string, number> }).successCache;
  assert.deepEqual([...cache.keys()], [
    `${first!.sourceHash}:${second!.sourceHash}`,
    `${second!.sourceHash}:${first!.sourceHash}`,
    `${first!.sourceHash}:${changed!.sourceHash}`,
  ]);
  for (const [key, expiry] of cache) {
    assert.match(key, /^[a-f0-9]{64}(?::[a-f0-9]{64}){0,1}$/);
    assert.equal(typeof expiry, 'number');
  }
});

it('never caches rejection or provider failure', async () => {
  const photos = await evidence();
  let requests = 0;
  const validator = PhotoValidationService.create(config, async () => {
    requests += 1;
    if (requests === 1) return response(['unrelated']);
    if (requests === 2) throw new Error('temporary provider failure');
    return response(['related']);
  });
  await assert.rejects(validator.validate(photos), (error: unknown) => error instanceof ApiError && error.code === 'PHOTO_NOT_PM');
  await assert.rejects(validator.validate(photos), (error: unknown) => error instanceof ApiError && error.code === 'PHOTO_VALIDATION_UNAVAILABLE');
  await validator.validate(photos);
  await validator.validate(photos);
  assert.equal(requests, 3);
});

it('rejects one unrelated attachment and fails closed on malformed output/provider errors', async () => {
  const photos = await evidence(2);
  const unrelated = PhotoValidationService.create(config, async () => response(['related', 'unrelated']));
  await assert.rejects(unrelated.validate(photos), (error: unknown) =>
    error instanceof ApiError && error.status === 422 && error.code === 'PHOTO_NOT_PM');
  const unclear = PhotoValidationService.create(config, async () => response(['uncertain', 'uncertain']));
  await assert.rejects(unclear.validate(photos), (error: unknown) =>
    error instanceof ApiError && error.status === 422 && error.code === 'PHOTO_NOT_PM');
  const invalid = PhotoValidationService.create(config, async () => response(['related']));
  await assert.rejects(invalid.validate(photos), (error: unknown) =>
    error instanceof ApiError && error.status === 503 && error.code === 'PHOTO_VALIDATION_UNAVAILABLE');
  const failed = PhotoValidationService.create(config, async () => { throw new Error('sensitive AWS diagnostic'); });
  await assert.rejects(failed.validate(photos), (error: unknown) =>
    error instanceof ApiError && error.status === 503 && error.code === 'PHOTO_VALIDATION_UNAVAILABLE'
      && !error.message.includes('sensitive'));
  const timed = PhotoValidationService.create(config, async () => new Promise<ConverseCommandOutput>(() => {}), 500);
  await assert.rejects(timed.validate(photos), (error: unknown) =>
    error instanceof ApiError && error.status === 503 && error.code === 'PHOTO_VALIDATION_UNAVAILABLE');
});

it('keeps prepared evidence admissible when production AI is disabled', async () => {
  const disabled = PhotoValidationService.create(readConfig({ NODE_ENV: 'production' }));
  assert.equal(disabled.configured, false);
  await disabled.validate(await evidence());
  await assert.rejects(disabled.validate([]), (error: unknown) =>
    error instanceof ApiError && error.status === 400 && error.code === 'INVALID_PHOTOS');
  const prepared = await evidence(2);
  await assert.rejects(disabled.validate([...prepared, prepared[0]!]), (error: unknown) =>
    error instanceof ApiError && error.status === 400 && error.code === 'INVALID_PHOTOS' && /1~2장/.test(error.message));
  await assert.rejects(evidence(3), (error: unknown) =>
    error instanceof ApiError && error.status === 400 && error.code === 'INVALID_PHOTOS');
});
