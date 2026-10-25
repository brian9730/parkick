import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const evidence = resolve('tests/fixtures/unknown-qr.png');

test('report reasons and optional description fit the mobile viewport', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2636, longitude: 127.0286, accuracy: 24 });
  await page.goto('/report');

  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('beam');
  await page.getByLabel('기기번호', { exact: true }).fill('MOBILE-LAYOUT-1');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();

  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(evidence);
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.locator('.location-confirmation input')).toBeEnabled();
  await page.locator('.location-confirmation input').check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();

  const options = page.locator('.category-step .category-option');
  const next = page.getByRole('button', { name: '연락처 화면 보기', exact: true });
  await expect(options).toHaveCount(10);
  await page.waitForTimeout(350); // Let the wizard's smooth heading scroll settle.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(options.last()).toBeInViewport({ ratio: 1 });
  await expect(next).toBeInViewport({ ratio: 1 });

  await page.getByRole('button', { name: '기타', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByLabel('추가 설명 (선택)', { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(next).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
