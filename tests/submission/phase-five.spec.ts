import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

async function fillContactStep(page: Page) {
  await page.goto('/report');
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('unknown');
  await page.getByLabel('기기번호 확인 불가', { exact: true }).check();
  await page.getByLabel('업체 및 기기 정보를 확인했습니다.').check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByLabel('갤러리 사진 선택', { exact: true }).setInputFiles(resolve('tests/fixtures/unknown-qr.png'));
  await expect(page.getByRole('img', { name: '첨부한 현장 사진 1' })).toBeVisible();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByText('위도·경도 직접 입력', { exact: true }).click();
  await page.getByLabel('위도', { exact: true }).fill('0');
  await page.getByLabel('경도', { exact: true }).fill('0');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '보행로 통행 방해', exact: true }).click();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByLabel('신고 내용', { exact: true }).fill(`브라우저 통합 검증 ${randomUUID()}`);
  await page.getByLabel('신고 내용을 확인했습니다.', { exact: true }).check();
  await page.getByRole('button', { name: '연락처 화면 보기' }).click();
  await expect(page.getByRole('button', { name: '신고 제출', exact: true })).toBeEnabled();
}

test('a slow successful submission remains pending beyond one minute and reaches its receipt', async ({ page }) => {
  test.setTimeout(100_000);
  await fillContactStep(page);
  await page.route('**/api/reports', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    // Models the previous real-world failure: total transfer/confirmation exceeds 60 seconds.
    await new Promise(resolve => setTimeout(resolve, 65_000));
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: '신고 제출', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/\/report\/complete$/, { timeout: 75_000 });
  await expect(page.getByRole('heading', { name: '개발용 신고가 접수됐어요' })).toBeVisible();
  await expect(page.getByText('전화번호 없이 접수했어요', { exact: true })).toBeVisible();
});

test('phone submission reaches completion then real lookup and detail without storing the phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = `010${String(Date.now()).slice(-8)}`;
  const lookupRequests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/reports/lookup')) lookupRequests.push({ url: request.url(), method: request.method(), body: request.postData() });
  });
  await fillContactStep(page);
  await page.getByLabel('휴대전화 번호 (선택)', { exact: true }).fill(phone);
  await page.getByRole('checkbox', { name: /번호 입력 시 필수/ }).check();
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/reports') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '신고 제출', exact: true }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const receipt = (await response.json()).data;
  await expect(page).toHaveURL(/\/report\/complete$/);
  await expect(page.getByText(receipt.publicId, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '처리결과 조회', exact: true }).click();
  await page.getByLabel('휴대전화 번호', { exact: true }).fill(phone);
  await page.getByRole('button', { name: '신고내역 조회', exact: true }).click();
  await expect(page.getByText(receipt.publicId, { exact: true })).toBeVisible();
  const row = page.getByRole('link').filter({ hasText: receipt.publicId });
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/report/status/${receipt.publicId}$`));
  await expect(page.getByText(receipt.publicId, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('접수', { exact: true }).first()).toBeVisible();
  expect(lookupRequests.length).toBeGreaterThanOrEqual(2);
  expect(lookupRequests.every(request => request.method === 'POST' && !request.url.includes(phone) && JSON.parse(request.body!).phone.replaceAll('-', '') === phone)).toBe(true);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })) ).not.toContain(phone);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('phone-lookup-detail-mobile.png'), fullPage: true });
  await page.goBack();
  await expect(page.getByText(receipt.publicId, { exact: true })).toBeVisible();
  await page.getByLabel('휴대전화 번호', { exact: true }).fill('010');
  await expect(page.getByText(receipt.publicId, { exact: true })).toHaveCount(0);
  await page.goto(`/report/status/${receipt.publicId}`);
  await expect(page.getByRole('heading', { name: /먼저 전화번호/ })).toBeVisible();
});
