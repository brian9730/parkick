import sharp from 'sharp';
import { test, expect, type Page } from '@playwright/test';

const gallery = (page: Page) => page.getByLabel('갤러리 사진 선택', { exact: true });
const preview = (page: Page) => page.getByRole('img', { name: '첨부한 현장 사진 1' });

async function openPhotos(page: Page) {
  await page.goto('/report');
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('beam');
  await page.getByLabel('기기번호', { exact: true }).fill('PHOTO-JPEG');
  await page.getByLabel('업체 및 기기 정보를 확인했습니다.').check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
}

async function previewPixels(page: Page) {
  await expect.poll(() => preview(page).evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  return preview(page).evaluate(async element => {
    const image = element as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const digest = await crypto.subtle.digest('SHA-256', context.getImageData(0, 0, canvas.width, canvas.height).data);
    return {
      width: canvas.width, height: canvas.height,
      pixels: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
    };
  });
}

test('JPEG camera data after EOI preserves the primary still image through optimization', async ({ page }) => {
  const original = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="1800"><rect width="1500" height="1800" fill="red"/><rect x="1500" width="1500" height="1800" fill="blue"/></svg>'))
    .jpeg({ quality: 100 }).toBuffer();
  // Motion Photo files similarly append video bytes after the primary JPEG's EOI.
  const withTrailer = Buffer.concat([original, Buffer.from('camera trailer after JPEG EOI\0')]);
  await openPhotos(page);
  await gallery(page).setInputFiles({ name: 'baseline.jpg', mimeType: 'image/jpeg', buffer: original });
  const baseline = await previewPixels(page);
  expect(baseline).toMatchObject({ width: 2560, height: 1536 });
  await page.getByRole('button', { name: '사진 1 삭제', exact: true }).click();
  await gallery(page).setInputFiles({ name: 'camera-trailer.jpg', mimeType: 'image/jpeg', buffer: withTrailer });
  expect(await previewPixels(page)).toEqual(baseline);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('progressive JPEG scans are accepted but an EOI inside metadata cannot hide a truncated image', async ({ page }) => {
  const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#46a062' } })
    .jpeg({ progressive: true }).toBuffer();
  expect((await sharp(original).metadata()).isProgressive).toBe(true);
  await openPhotos(page);
  await gallery(page).setInputFiles({ name: 'progressive.jpg', mimeType: 'image/jpeg', buffer: original });
  expect(await previewPixels(page)).toMatchObject({ width: 1200, height: 800 });
  const existing = await preview(page).getAttribute('src');
  // APP15 contains FF D9, but the primary JPEG's real EOI is removed.
  const truncated = Buffer.concat([original.subarray(0, 2), Buffer.from([0xff, 0xef, 0, 4, 0xff, 0xd9]), original.subarray(2, -2)]);
  await gallery(page).setInputFiles({ name: 'truncated.jpg', mimeType: 'image/jpeg', buffer: truncated });
  await expect(page.getByRole('alert')).toContainText('손상되었거나 열 수 없는 사진');
  await expect(preview(page)).toHaveAttribute('src', existing!);
  await expect(page.getByRole('img', { name: /첨부한 현장 사진/ })).toHaveCount(1);
});
