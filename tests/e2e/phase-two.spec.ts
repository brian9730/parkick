import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

// Real QR image with a synthetic payload, never an asserted PM vendor format.
const qrImage = resolve('tests/fixtures/unknown-qr.png');
const qrRaw = 'https://unverified.example.invalid/device/phase2-test';
const photoBytes = readFileSync(qrImage);
const next = (page: Page) => page.getByRole('button', { name: '다음 단계', exact: true }).click();

async function expectMobileNoVerticalScroll(page: Page, heights: number[] = [844, 667]) {
  for (const height of heights) {
    await page.setViewportSize({ width: 390, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function forceScrollBeforeNavigation(page: Page) {
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.dataset.testScrollSpacer = '';
    spacer.style.height = '400px';
    document.body.appendChild(spacer);
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
}

async function removeTestScrollSpacer(page: Page) {
  await page.evaluate(() => document.querySelector('[data-test-scroll-spacer]')?.remove());
}

async function manualDevice(page: Page) {
  await page.goto('/report');
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('사용자가 확인한 업체');
  await page.getByLabel('기기번호', { exact: true }).fill('TEST-DEVICE');
  await next(page);
}

async function locationStep(page: Page) {
  await manualDevice(page);
  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(qrImage);
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await next(page);
}

test('mobile wizard enforces required evidence and keeps data through back navigation', async ({ page, context }, testInfo) => {
  const writes: string[] = [];
  const errors: string[] = [];
  const mapRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/api/')) writes.push(request.url());
    if (/(^|\.)(naver\.com|pstatic\.net|navercloud\.com)$/.test(new URL(request.url()).hostname)) mapRequests.push(request.url());
  });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.2636, longitude: 127.0286, accuracy: 24 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/report');
  await expectMobileNoVerticalScroll(page);
  await next(page);
  await expect(page.getByRole('alert')).toContainText('운영업체를 선택하거나');
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('사용자가 확인한 업체');
  await page.getByLabel('기기번호', { exact: true }).fill('TEST-DEVICE');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('.wizard-validation')).toHaveCount(0);
  await expectMobileNoVerticalScroll(page);
  await page.screenshot({ path: testInfo.outputPath('device-mobile.png'), fullPage: true });
  await next(page);
  const photoGuidance = page.locator('.photo-guidance');
  await expect(photoGuidance).toContainText('현장사진을 촬영해 주세요.');
  await expect(photoGuidance).toContainText('3미터 떨어진 위치에서 신고 대상 기기 전체가 보이도록 촬영해 주세요.');
  await expect(photoGuidance).toContainText('행인 얼굴이나 제3자 차량번호판 등 개인정보가 찍히지 않도록 주의해 주세요.');
  await expect(photoGuidance).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: '갤러리에서 선택', exact: true })).toBeInViewport({ ratio: 1 });
  await next(page);
  await expect(page.getByRole('alert')).toContainText('현장 사진을 최소 1장');
  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(qrImage);
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await expect(page.locator('.wizard-validation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '다음 단계', exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('photos-mobile.png'), fullPage: true });
  await forceScrollBeforeNavigation(page);
  await next(page);
  await expect(page.getByText('지도 서비스 미연결', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await removeTestScrollSpacer(page);
  await expect(page.getByRole('button', { name: '현재 위치 다시 확인', exact: true })).toBeVisible();
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toBeEnabled();
  await page.getByRole('button', { name: '현재 위치 다시 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '현재 위치 다시 확인', exact: true })).toBeVisible();
  await next(page);
  await expect(page.getByRole('alert')).toContainText('신고할 위치를 확인한');
  await page.getByLabel('주소 또는 위치 설명 (선택)').fill('테스트 위치 설명');
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await expect(page.locator('.wizard-validation')).toHaveCount(0);
  // The no-map fallback adds manual coordinates and address help; the live-map path is checked separately at 667px.
  await expectMobileNoVerticalScroll(page, [844]);
  await page.screenshot({ path: testInfo.outputPath('location-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByLabel('기타 업체명', { exact: true })).toHaveValue('사용자가 확인한 업체');
  await expect(page.getByLabel('기기번호', { exact: true })).toHaveValue('TEST-DEVICE');
  await page.getByLabel('기기번호', { exact: true }).fill('TEST-EDITED');
  await next(page);
  await next(page);
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('테스트 위치 설명');
  await forceScrollBeforeNavigation(page);
  await next(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('어떤 불편이 있나요?');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await removeTestScrollSpacer(page);
  await expectMobileNoVerticalScroll(page);
  await page.getByRole('button', { name: '연락처 화면 보기' }).click();
  await expect(page.getByRole('alert')).toContainText('신고 유형을 하나 이상');
  await page.getByRole('button', { name: '보행로 통행 방해', exact: true }).click();
  await page.getByRole('button', { name: '기타', exact: true }).click();
  await page.getByLabel('추가 설명 (선택)', { exact: true }).fill('테스트용 추가 설명');
  await expectMobileNoVerticalScroll(page);
  await page.getByRole('button', { name: '연락처 화면 보기' }).click();
  const phone = page.getByLabel('휴대전화 번호 (선택)', { exact: true });
  const phoneConsent = page.getByRole('checkbox', { name: /번호 입력 시 필수/ });
  await expect(phone).toHaveValue('');
  await expect(phone).not.toHaveAttribute('required', '');
  await expect(phoneConsent).toHaveCount(0);
  await expect(page.locator('.report-summary')).toContainText('입력하지 않음');
  // Consent is needed only for an optional phone, and must not survive removing it.
  await phone.fill('01000000000');
  await expect(phoneConsent).toBeVisible();
  await expect(phoneConsent).not.toBeChecked();
  await phoneConsent.check();
  await phone.fill('');
  await expect(phoneConsent).toHaveCount(0);
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await page.getByRole('button', { name: '연락처 화면 보기' }).click();
  await expect(phone).toHaveValue('');
  await expect(phoneConsent).toHaveCount(0);
  await phone.fill('01000000000');
  await expect(phoneConsent).not.toBeChecked();
  await phoneConsent.check();
  await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeDisabled();
  await expect(page.locator('.report-summary')).toContainText('TEST-EDITED');
  await expect(page.locator('.report-summary')).toContainText('보행로 통행 방해, 기타');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toContain('/api/reports/validate-photos');
  expect(mapRequests).toEqual([]);
  expect(errors).toEqual([]);
  await page.goto('/report/complete');
  await expect(page.getByText('접수된 신고 정보가 없어요')).toBeVisible();
  await page.goto('/report');
  await expect(page.getByLabel('운영업체', { exact: true })).toHaveCount(0);
});

test('real QR image decoding calls real parser and preserves unknown data without visiting its URL', async ({ page }) => {
  const visits: string[] = [];
  page.on('request', request => { if (request.url().includes('unverified.example.invalid')) visits.push(request.url()); });
  await page.goto('/report');
  const response = page.waitForResponse('/api/qr/parse');
  await page.getByLabel('QR 코드 사진 선택', { exact: true }).setInputFiles(qrImage);
  const parsed = await response;
  expect(parsed.status()).toBe(200);
  expect((await parsed.json()).data).toMatchObject({ rawQr: qrRaw, matched: false, operatorId: null, deviceId: null });
  await expect(page.getByText('업체를 자동으로 확인할 수 없습니다.', { exact: false })).toBeVisible();
  await page.getByText('읽은 QR 원문 확인', { exact: true }).click();
  await expect(page.locator('.qr-result pre')).toHaveText(qrRaw);
  expect(visits).toEqual([]);
  await page.getByLabel('운영업체', { exact: true }).selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('사진에서 확인한 업체');
  await page.getByLabel('기기번호', { exact: true }).fill('QR-UNKNOWN-1');
  await next(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
});

test('parser outage retains scanned QR and supports manual continuation', async ({ page }) => {
  await page.route('**/api/qr/parse', route => route.abort('failed'));
  await page.goto('/report');
  await page.getByLabel('QR 코드 사진 선택', { exact: true }).setInputFiles(qrImage);
  await expect(page.getByText('QR 정보 확인 서버에 연결하지 못했습니다.', { exact: false })).toBeVisible();
  await page.getByText('읽은 QR 원문 확인', { exact: true }).click();
  await expect(page.locator('.qr-result pre')).toHaveText(qrRaw);
  await page.getByLabel('운영업체', { exact: true }).selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('사진에서 확인한 업체');
  await page.getByLabel('기기번호', { exact: true }).fill('QR-UNKNOWN-2');
  await next(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('현장 사진을 등록해 주세요');
});

test('photos reject invalid batches, replace and remove evidence, and release all preview URLs', async ({ page }) => {
  await page.addInitScript(() => {
    const active = new Set<string>();
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = object => { const url = originalCreate(object); active.add(url); return url; };
    URL.revokeObjectURL = url => { active.delete(url); originalRevoke(url); };
    Object.assign(window, { evidenceUrls: active });
  });
  await manualDevice(page);
  const gallery = page.getByLabel('갤러리 사진 선택', { exact: true });
  const valid = (name: string) => ({ name, mimeType: 'image/png', buffer: photoBytes });
  await gallery.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert')).toContainText('실제 형식이 확장자와 달라요');
  await gallery.setInputFiles({ name: 'corrupt.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]) });
  await expect(page.getByRole('alert')).toContainText('손상되었거나 열 수 없는 사진');
  await gallery.setInputFiles({ name: 'oversize.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toContainText('10MB 이하');
  await gallery.setInputFiles([valid('1.png'), valid('2.png'), valid('3.png')]);
  await expect(page.getByRole('alert')).toContainText('최대 2장');
  await expect(page.getByRole('img', { name: /첨부한 현장 사진/ })).toHaveCount(0);
  await gallery.setInputFiles([valid('1.png'), valid('2.png')]);
  await expect(page.getByRole('img', { name: /첨부한 현장 사진/ })).toHaveCount(2);
  await expect(gallery).toBeDisabled();
  await expect(page.locator('.photo-capture [role="status"]')).toContainText('2/2장 첨부');
  const firstUrl = await page.getByRole('img', { name: '첨부한 현장 사진 1' }).getAttribute('src');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '사진 1 다시 촬영', exact: true }).click();
  await (await chooser).setFiles(valid('replacement.png'));
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).not.toHaveAttribute('src', firstUrl!);
  await expect(page.getByRole('img', { name: /첨부한 현장 사진/ })).toHaveCount(2);
  await page.getByRole('button', { name: '사진 2 삭제', exact: true }).click();
  await expect(page.getByRole('img', { name: /첨부한 현장 사진/ })).toHaveCount(1);
  await expect(gallery).toBeEnabled();
  await gallery.setInputFiles(valid('3.png'));
  await expect(page.getByRole('img', { name: /첨부한 현장 사진/ })).toHaveCount(2);
  expect(await page.evaluate(() => (window as unknown as { evidenceUrls: Set<string> }).evidenceUrls.size)).toBe(2);
  await next(page);
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByRole('img', { name: /첨부한 현장 사진/ })).toHaveCount(2);
  await page.getByRole('link', { name: '홈으로', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { evidenceUrls: Set<string> }).evidenceUrls.size)).toBe(0);
});

test('denied GPS permits manual coordinates and editing invalidates earlier confirmation', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) => error?.({ code: 1, message: 'Test permission denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });
  await locationStep(page);
  await expect(page.getByRole('alert')).toContainText('위치 권한');
  await page.getByRole('button', { name: '현재 위치 확인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('위치 권한');
  await page.getByLabel('위도', { exact: true }).fill('91');
  await page.getByLabel('경도', { exact: true }).fill('127');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await expect(page.locator('#location-coordinate-error')).toBeVisible();
  await expect(page.getByLabel('실제 신고할 위치임을 확인했습니다.')).toBeDisabled();
  await page.getByLabel('위도', { exact: true }).fill('37.2636');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await page.getByLabel('경도', { exact: true }).fill('127.0286');
  await expect(page.getByLabel('실제 신고할 위치임을 확인했습니다.')).not.toBeChecked();
  await expect(page.getByLabel('실제 신고할 위치임을 확인했습니다.')).toBeDisabled();
  await next(page);
  await expect(page.locator('.wizard-validation')).toContainText('현재 위치를 가져오거나');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await page.getByLabel('주소 또는 위치 설명 (선택)').fill('사용자 입력 위치');
  await expect(page.getByLabel('실제 신고할 위치임을 확인했습니다.')).not.toBeChecked();
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await next(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('어떤 불편이 있나요?');
});
