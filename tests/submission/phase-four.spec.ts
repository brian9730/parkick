import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { PrismaClient } from '../../backend/src/generated/prisma/client.js';

const photo = resolve('tests/fixtures/unknown-qr.png');
const databaseUrl = 'postgresql://parkick_local@127.0.0.1:55432/parkick_test';
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
test.afterAll(async () => { await db.$disconnect(); });

async function fillReport(page: Page, expectEnabled = true, knownOperator?: string, evidence: string | { name: string; mimeType: string; buffer: Buffer } = photo) {
  await page.goto('/report');
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption(knownOperator ?? 'other');
  if (!knownOperator) await page.getByLabel('기타 업체명', { exact: true }).fill('접수 테스트 업체');
  await page.getByLabel('기기번호', { exact: true }).fill('LOCAL-PHASE4');
  await page.getByLabel('업체 및 기기 정보를 확인했습니다.').check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(evidence);
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByText('위도·경도 직접 입력', { exact: true }).click();
  await page.getByLabel('위도', { exact: true }).fill('37.2636');
  await page.getByLabel('경도', { exact: true }).fill('127.0286');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await page.getByLabel('주소 또는 위치 설명 (선택)').fill('테스트 공원 출입구');
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '보행로 통행 방해', exact: true }).click();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByLabel('신고 내용', { exact: true }).fill('현장에서 확인한 주차 상황을 신고합니다.');
  await page.getByLabel('신고 내용을 확인했습니다.', { exact: true }).check();
  await page.getByRole('button', { name: '연락처 화면 보기' }).click();
  if (expectEnabled) await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeEnabled();
}

test('anonymous submission persists to PostgreSQL and private files, and receipt survives refresh', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Exercise browser resize and EXIF orientation through the real upload/storage pipeline.
  const original = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#d4b355' } })
    .withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toBuffer();
  await fillReport(page, true, 'kakao-bike', { name: 'rotated-evidence.jpg', mimeType: 'image/jpeg', buffer: original });
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/reports') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '신고 제출', exact: true }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const receipt = (await response.json()).data;
  expect(receipt).toMatchObject({ status: 'RECEIVED', hasContact: false });
  expect(receipt.publicId).toMatch(/^PK-/);
  expect(Object.keys(receipt).sort()).toEqual(['address', 'createdAt', 'hasContact', 'latitude', 'longitude', 'publicId', 'status']);
  await expect(page).toHaveURL(/\/report\/complete$/);
  await expect(page.getByRole('heading', { name: '개발용 신고가 접수됐어요' })).toBeVisible();
  await expect(page.getByText(receipt.publicId, { exact: true })).toBeVisible();
  const saved = await db.report.findUniqueOrThrow({ where: { publicId: receipt.publicId }, include: { images: true, categories: true, statusHistory: true, region: true } });
  expect(saved.contactPhoneCipher).toBeNull();
  expect(saved.phoneIdentifier).toBeNull();
  expect(saved.consentedAt).toBeNull();
  expect(saved.region.code).toBe('local-development');
  expect(saved.tenantId).toBe(saved.region.tenantId);
  expect(saved.operatorName).toBe('카카오 T 바이크');
  expect(saved.statusHistory).toHaveLength(1);
  expect(saved.statusHistory[0].newStatus).toBe('RECEIVED');
  expect(saved.categories).toHaveLength(1);
  expect(saved.images).toHaveLength(1);
  expect(saved.images[0].exifRemoved).toBe(true);
  const bytes = await readFile(resolve('test-results/submission-evidence', saved.images[0].objectKey));
  expect(bytes.length).toBe(saved.images[0].sizeBytes);
  const storedImage = await sharp(bytes).metadata();
  expect(storedImage).toMatchObject({ format: 'jpeg', width: 1920, height: 2560 });
  expect(storedImage.orientation).toBeUndefined();
  expect(storedImage.exif).toBeUndefined();
  expect(bytes.length).toBeLessThan(original.length);
  expect((await request.get('/api/reports/' + receipt.publicId)).status()).toBe(404);
  await page.reload();
  await expect(page.getByText(receipt.publicId, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('receipt-mobile.png'), fullPage: true });
});

test('optional phone requires valid format and consent, then stores encrypted contact without exposing it', async ({ page }) => {
  await fillReport(page);
  const phone = page.getByLabel('휴대전화 번호 (선택)', { exact: true });
  await phone.fill('0101234');
  await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toBeVisible();
  await phone.fill('01012345678');
  await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('동의');
  await page.getByRole('checkbox', { name: /번호 입력 시 필수/ }).check();
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/reports') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '신고 제출', exact: true }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain('01012345678');
  expect(body.data.hasContact).toBe(true);
  const saved = await db.report.findUniqueOrThrow({ where: { publicId: body.data.publicId } });
  expect(saved.contactPhoneCipher).not.toBeNull();
  expect(Buffer.from(saved.contactPhoneCipher!).toString()).not.toContain('01012345678');
  expect(saved.phoneIdentifier).toMatch(/^[a-f0-9]{64}$/);
  expect(saved.contactPhoneMasked).toBe('010-****-5678');
  expect(saved.consentedAt).not.toBeNull();
  await expect(page).toHaveURL(/\/report\/complete$/);
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('01012345678');
});

test('a lost successful response can be retried without creating duplicate reports or photos', async ({ page }) => {
  await fillReport(page);
  let firstReceipt: { publicId: string } | undefined;
  let calls = 0;
  await page.route('**/api/reports', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    calls += 1;
    const result = await route.fetch();
    if (calls === 1) {
      expect(result.status()).toBe(201);
      firstReceipt = (await result.json()).data;
      await route.abort('failed');
    } else {
      expect(result.status()).toBe(200);
      await route.fulfill({ response: result });
    }
  });
  await page.getByRole('button', { name: '신고 제출', exact: true }).click();
  await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/report$/);
  await page.getByRole('button', { name: '신고 제출', exact: true }).click();
  await expect(page).toHaveURL(/\/report\/complete$/);
  expect(calls).toBe(2);
  await expect(page.getByText(firstReceipt!.publicId, { exact: true })).toBeVisible();
  const saved = await db.report.findUniqueOrThrow({ where: { publicId: firstReceipt!.publicId }, include: { images: true } });
  expect(await db.report.count({ where: { submissionId: saved.submissionId } })).toBe(1);
  expect(saved.images).toHaveLength(1);
});

test('unavailable intake preserves entered content and lets the user retry service status', async ({ page }) => {
  await page.route('**/api/reports/status', route => route.fulfill({ json: { data: { available: false, mode: 'disabled' } } }));
  await fillReport(page, false);
  await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeDisabled();
  await page.unroute('**/api/reports/status');
  await page.getByRole('button', { name: '접수 상태 다시 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByLabel('신고 내용', { exact: true })).toHaveValue('현장에서 확인한 주차 상황을 신고합니다.');
});
