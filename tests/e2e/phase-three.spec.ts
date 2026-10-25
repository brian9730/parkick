import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const photo = resolve('tests/fixtures/unknown-qr.png');
const next = (page: Page) => page.getByRole('button', { name: '다음 단계', exact: true }).click();

async function startWithManualDevice(page: Page) {
  await page.goto('/report');
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('beam');
  await page.getByLabel('기기번호', { exact: true }).fill('BEAM-123');
  await next(page);
}

async function setLocation(page: Page) {
  if (!(await page.getByLabel('위도', { exact: true }).isVisible())) await page.getByText('위도·경도 직접 입력', { exact: true }).click();
  await page.getByLabel('위도', { exact: true }).fill('37.2636');
  await page.getByLabel('경도', { exact: true }).fill('127.0286');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await next(page);
}

test('operator and device number are required without QR or confirmation checkboxes', async ({ page }) => {
  await page.goto('/report');
  await next(page);
  await expect(page.getByRole('alert')).toContainText('운영업체를 선택');
  await expect(page.getByLabel('운영업체', { exact: true })).toBeVisible();
  await page.getByLabel('운영업체', { exact: true }).selectOption('beam');
  await next(page);
  await expect(page.getByRole('alert')).toContainText('기기번호를 입력');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByLabel('기기번호', { exact: true }).fill('BEAM-123');
  await next(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
  await expect(page.locator('.step-indicator li')).toHaveCount(5);
});

test('irrelevant photo blocks progress and a replacement can be checked again', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/reports/validate-photos', route => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 422, json: { error: { code: 'PHOTO_NOT_PM', message: '공유 킥보드 또는 자전거가 확인되지 않습니다. 올바른 현장 사진을 다시 첨부해주세요.' } } });
    return route.fulfill({ json: { data: { valid: true } } });
  });
  await startWithManualDevice(page);
  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(photo);
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await next(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
  await expect(page.getByRole('alert')).toContainText('올바른 현장 사진을 다시 첨부');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '사진 1 다시 촬영', exact: true }).click();
  await (await chooser).setFiles(photo);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await next(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('신고 위치를 확인해 주세요');
  expect(attempts).toBe(2);
});

test('photo check outage prevents the next step and can be retried', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/reports/validate-photos', route => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 503, json: { error: { code: 'PHOTO_VALIDATION_UNAVAILABLE', message: '사진 확인 서비스를 이용할 수 없습니다.' } } });
    return route.fulfill({ json: { data: { valid: true } } });
  });
  await startWithManualDevice(page);
  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(photo);
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await next(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
  await expect(page.getByRole('alert')).toContainText('사진을 확인할 수 없어');
  await next(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('신고 위치를 확인해 주세요');
  expect(attempts).toBe(2);
});

test('disabled AI mode describes format-only checking and still permits submission', async ({ page }) => {
  let checks = 0;
  await page.route('**/api/reports/status', route => route.fulfill({ json: {
    data: { available: true, mode: 'local', photoValidation: 'disabled' },
  } }));
  await page.route('**/api/reports/validate-photos', route => {
    checks += 1;
    return route.fulfill({ json: { data: { valid: true, photoValidation: 'disabled' } } });
  });
  await startWithManualDevice(page);
  await expect(page.getByText('AI 사진 판정은 아직 적용되지 않았어요. 사진 파일 형식만 확인하고 신고를 접수합니다.')).toBeVisible();
  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(photo);
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await next(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('신고 위치를 확인해 주세요');
  expect(checks).toBe(1);
  await setLocation(page);
  await page.getByRole('button', { name: '보행로 통행 방해', exact: true }).click();
  await page.getByRole('button', { name: '연락처 화면 보기', exact: true }).click();
  await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeEnabled();
});

test('five-step report uses category alone and returns to photo when final check rejects it', async ({ page }) => {
  const aiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/ai/generate-report')) aiRequests.push(request.url()); });
  await page.route('**/api/reports/validate-photos', route => route.fulfill({ json: { data: { valid: true } } }));
  await page.route('**/api/reports/status', route => route.fulfill({ json: { data: { available: true, mode: 'local', photoValidation: 'mock' } } }));
  await page.route('**/api/reports', route => route.fulfill({ status: 422, json: { error: { code: 'PHOTO_NOT_PM', message: '공유 킥보드 또는 자전거가 확인되지 않습니다. 올바른 현장 사진을 다시 첨부해주세요.' } } }));
  await startWithManualDevice(page);
  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(photo);
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await next(page);
  await setLocation(page);
  await page.getByRole('button', { name: '기타', exact: true }).click();
  await page.getByRole('button', { name: '연락처 화면 보기', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('연락처 입력 (선택)');
  await expect(page.getByLabel('신고 내용', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '신고 제출', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
  await expect(page.getByRole('alert')).toContainText('올바른 현장 사진을 다시 첨부');
  expect(aiRequests).toEqual([]);
});
