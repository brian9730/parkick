import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { PrismaClient } from '../../backend/src/generated/prisma/client.js';

const db = new PrismaClient({ datasources: { db: { url: 'postgresql://parkick_local@127.0.0.1:55432/parkick_test' } } });
test.afterAll(async () => { await db.$disconnect(); });

test('S3 status contract enables browser submission; persistence uses the isolated local test API, not real AWS', async ({ page }) => {
  // Only storage-mode discovery is substituted: submission and database persistence remain real local requests.
  await page.route('**/api/reports/status', route => route.fulfill({ json: { data: { available: true, mode: 's3' } } }));
  await page.goto('/report');
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('S3 상태 계약 테스트 업체');
  await page.getByLabel('기기번호', { exact: true }).fill('S3-STATUS-CONTRACT');
  await page.getByLabel('업체 및 기기 정보를 확인했습니다.').check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(resolve('tests/fixtures/unknown-qr.png'));
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByText('위도·경도 직접 입력', { exact: true }).click();
  await page.getByLabel('위도', { exact: true }).fill('37.2636');
  await page.getByLabel('경도', { exact: true }).fill('127.0286');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await page.getByLabel('주소 또는 위치 설명 (선택)').fill('S3 상태 계약 테스트 장소');
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '보행로 통행 방해', exact: true }).click();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByLabel('신고 내용', { exact: true }).fill('S3 상태를 받은 화면에서 실제 접수 요청을 확인합니다.');
  await page.getByLabel('신고 내용을 확인했습니다.', { exact: true }).check();
  await page.getByRole('button', { name: '연락처 화면 보기' }).click();
  await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeEnabled();
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/reports') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '신고 제출', exact: true }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const receipt = (await response.json()).data;
  expect(receipt).toMatchObject({ status: 'RECEIVED', hasContact: false });
  await expect(page).toHaveURL(/\/report\/complete$/);
  await expect(page.getByText(receipt.publicId, { exact: true })).toBeVisible();
  const saved = await db.report.findUniqueOrThrow({ where: { publicId: receipt.publicId }, include: { images: true } });
  expect(saved.operatorName).toBe('S3 상태 계약 테스트 업체');
  expect(saved.contactPhoneCipher).toBeNull();
  expect(saved.images).toHaveLength(1);
  expect(saved.images[0].objectKey).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
});
