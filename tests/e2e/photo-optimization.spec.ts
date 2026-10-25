import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { test, expect, type Page } from '@playwright/test';

const gallery = (page: Page) => page.getByLabel('갤러리 사진 선택', { exact: true });
const preview = (page: Page) => page.getByRole('img', { name: '첨부한 현장 사진 1' });
const next = (page: Page) => page.getByRole('button', { name: '다음 단계', exact: true }).click();

async function openPhotos(page: Page) {
  await page.goto('/report');
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('사진 최적화 테스트');
  await page.getByLabel('기기번호', { exact: true }).fill('PHOTO-TEST');
  await next(page);
}

async function previewContents(page: Page) {
  await expect.poll(() => preview(page).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  return preview(page).evaluate(async element => {
    const image = element as HTMLImageElement;
    const blob = await (await fetch(image.src)).blob();
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return {
      width: image.naturalWidth, height: image.naturalHeight, size: blob.size, mime: blob.type,
      hash: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
    };
  });
}

async function trackUrls(page: Page) {
  await page.addInitScript(() => {
    const active = new Set<string>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = object => { const url = create(object); active.add(url); return url; };
    URL.revokeObjectURL = url => { active.delete(url); revoke(url); };
    Object.assign(window, { photoTestUrls: active });
  });
}

const activeUrls = (page: Page) => page.evaluate(() => (window as unknown as { photoTestUrls: Set<string> }).photoTestUrls.size);

// Construct valid PNG chunks so the animation and resolution tests exercise their
// own rules, rather than merely failing on a corrupt checksum.
function pngChunk(type: string, data: Buffer) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const value of chunk.subarray(4, -4)) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return chunk;
}

test('large EXIF-rotated photo is resized with its orientation and keeps the prepared bytes through navigation', async ({ page }) => {
  const original = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="3000"><rect width="2000" height="3000" fill="red"/><rect x="2000" width="2000" height="3000" fill="blue"/></svg>'))
    .withMetadata({ orientation: 6 }).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
  await openPhotos(page);
  await gallery(page).setInputFiles({ name: 'rotated-evidence.jpg', mimeType: 'image/jpeg', buffer: original });
  await expect(preview(page)).toBeVisible();
  const prepared = await previewContents(page);
  expect(prepared).toMatchObject({ width: 1920, height: 2560, mime: 'image/jpeg' });
  expect(prepared.size).toBeLessThan(original.length * 0.75);
  // Orientation 6 rotates the red left half to the top and the blue half to the bottom.
  const colors = await preview(page).evaluate(element => {
    const image = element as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 4;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, 2, 4);
    return { top: [...context.getImageData(0, 0, 1, 1).data], bottom: [...context.getImageData(0, 3, 1, 1).data] };
  });
  expect(colors.top[0]).toBeGreaterThan(240);
  expect(colors.top[2]).toBeLessThan(15);
  expect(colors.bottom[2]).toBeGreaterThan(240);
  expect(colors.bottom[0]).toBeLessThan(15);
  await next(page);
  await page.getByRole('button', { name: '이전', exact: true }).click();
  expect(await previewContents(page)).toEqual(prepared);
});

test('already small PNG evidence keeps its original bytes without enlarging the photo', async ({ page }) => {
  const original = await sharp({ create: { width: 24, height: 16, channels: 4, background: '#42a56680' } }).png().toBuffer();
  await openPhotos(page);
  await gallery(page).setInputFiles({ name: 'small.png', mimeType: 'image/png', buffer: original });
  await expect(preview(page)).toBeVisible();
  expect(await previewContents(page)).toEqual({
    width: 24, height: 16, size: original.length, mime: 'image/png',
    hash: createHash('sha256').update(original).digest('hex'),
  });
});

test('animated, truncated and excessive-resolution batches preserve existing evidence and release temporary URLs', async ({ page }) => {
  await trackUrls(page);
  const original = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#46a062' } }).png().toBuffer();
  const jpeg = await sharp(original).jpeg().toBuffer();
  const animation = Buffer.alloc(8);
  animation.writeUInt32BE(2);
  const animated = Buffer.concat([original.subarray(0, 33), pngChunk('acTL', animation), original.subarray(33)]);
  const largeHeader = Buffer.from(original.subarray(16, 29));
  largeHeader.writeUInt32BE(8000, 0);
  largeHeader.writeUInt32BE(6000, 4);
  const overResolution = Buffer.concat([original.subarray(0, 8), pngChunk('IHDR', largeHeader), original.subarray(33)]);
  const valid = { name: 'existing.png', mimeType: 'image/png', buffer: original };
  await openPhotos(page);
  await gallery(page).setInputFiles(valid);
  await expect(preview(page)).toBeVisible();
  const existing = await preview(page).getAttribute('src');
  for (const invalid of [
    { name: 'animated.png', mimeType: 'image/png', buffer: animated, error: '움직이는 사진은 첨부할 수 없어요' },
    { name: 'truncated.jpg', mimeType: 'image/jpeg', buffer: jpeg.subarray(0, -10), error: '손상되었거나 열 수 없는 사진' },
    { name: 'too-many-pixels.png', mimeType: 'image/png', buffer: overResolution, error: '4,000만 화소 이하' },
  ]) {
    await gallery(page).setInputFiles([valid, { name: invalid.name, mimeType: invalid.mimeType, buffer: invalid.buffer }]);
    await expect(page.getByRole('alert')).toContainText(invalid.error);
    await expect(page.getByRole('img', { name: /첨부한 현장 사진/ })).toHaveCount(1);
    await expect(preview(page)).toHaveAttribute('src', existing!);
    await expect(gallery(page)).toBeEnabled();
    await expect.poll(() => activeUrls(page)).toBe(1);
  }
});

test('leaving the wizard aborts a pending conversion and a late canvas callback cannot retain evidence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await trackUrls(page);
  await page.addInitScript(() => {
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      toBlob.call(this, blob => {
        Object.assign(window, { finishPhotoTestConversion: () => callback(blob) });
      }, type, quality);
    };
  });
  const original = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#46a062' } }).jpeg().toBuffer();
  await openPhotos(page);
  await gallery(page).setInputFiles({ name: 'pending.jpg', mimeType: 'image/jpeg', buffer: original });
  await expect(page.getByText('업로드에 맞게 사진 용량을 줄이고 있어요…')).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { finishPhotoTestConversion?: unknown }).finishPhotoTestConversion)).toBe('function');
  await expect.poll(() => activeUrls(page)).toBe(1);
  await page.getByRole('link', { name: '홈으로', exact: true }).click();
  await expect.poll(() => activeUrls(page)).toBe(0);
  await page.evaluate(async () => {
    (window as unknown as { finishPhotoTestConversion: () => void }).finishPhotoTestConversion();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
  expect(await activeUrls(page)).toBe(0);
  await expect(page.getByRole('img', { name: /첨부한 현장 사진/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
