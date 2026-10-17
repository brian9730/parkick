import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectPhotoFile, MAX_PHOTO_BYTES } from './validation';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16]);
const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);

test('accepts matching JPEG, PNG, and WebP declarations and normalizes extensions', async () => {
  assert.deepEqual(await inspectPhotoFile(new File([jpeg], 'CAMERA.JPEG', { type: 'image/jpeg' })), { mime: 'image/jpeg', extension: 'jpg' });
  assert.deepEqual(await inspectPhotoFile(new File([png], '현장.png', { type: 'image/png' })), { mime: 'image/png', extension: 'png' });
  assert.deepEqual(await inspectPhotoFile(new File([webp], 'photo.webp', { type: 'image/webp' })), { mime: 'image/webp', extension: 'webp' });
});

test('rejects renamed executable/text, mismatched signatures, and disguised SVG', async () => {
  await assert.rejects(inspectPhotoFile(new File(['not an image'], 'photo.jpg', { type: 'image/jpeg' })), /실제 형식/);
  await assert.rejects(inspectPhotoFile(new File([png], 'photo.jpg', { type: 'image/jpeg' })), /실제 형식/);
  await assert.rejects(inspectPhotoFile(new File(['<svg></svg>'], 'photo.png', { type: 'image/png' })), /실제 형식/);
});

test('requires MIME and extension to agree instead of trusting accept hints', async () => {
  await assert.rejects(inspectPhotoFile(new File([png], 'photo.svg', { type: 'image/png' })), /파일 형식과 확장자/);
  await assert.rejects(inspectPhotoFile(new File([png], 'photo.png', { type: 'image/jpeg' })), /파일 형식과 확장자/);
  await assert.rejects(inspectPhotoFile(new File([png], 'photo.png')), /파일 형식과 확장자/);
});

test('rejects empty files and enforces the 10 MiB boundary before image decoding', async () => {
  await assert.rejects(inspectPhotoFile(new File([], 'photo.png', { type: 'image/png' })), /빈 파일/);
  const oversized = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], 'photo.png', { type: 'image/png' });
  await assert.rejects(inspectPhotoFile(oversized), /10MB 이하/);
  const boundary = new Uint8Array(MAX_PHOTO_BYTES);
  boundary.set(png);
  assert.equal((await inspectPhotoFile(new File([boundary], 'photo.png', { type: 'image/png' }))).mime, 'image/png');
});
