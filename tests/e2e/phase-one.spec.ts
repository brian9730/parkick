import { test, expect, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('public home uses the official logo and fits mobile and desktop', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('공유 킥보드');
  await expect(page.locator('img[alt="Parkick"]').first()).toHaveAttribute('src', '/assets/parkick_logo_text_noback.png');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('home-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('home-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('admin pages require server authentication and logout revokes it', async ({ page }, testInfo) => {
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get('/api/admin/dashboard')).status()).toBe(401);
  await page.getByLabel('이메일', { exact: true }).fill(process.env.PARKICK_E2E_ADMIN_EMAIL!);
  await page.getByLabel('비밀번호', { exact: true }).fill(process.env.PARKICK_E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: '관리자 로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('대시보드');
  expect((await page.request.get('/api/admin/dashboard')).status()).toBe(200);
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === 'parkick_admin_session')?.httpOnly).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('dashboard-tablet.png'), fullPage: true });
  if (await page.getByRole('button', { name: '관리자 메뉴 열기', exact: true }).isVisible()) {
    await page.getByRole('button', { name: '관리자 메뉴 열기', exact: true }).click();
  }
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await page.request.get('/api/admin/dashboard')).status()).toBe(401);
});


test('phone-only lookup has no verification step and reports its unavailable state truthfully', async ({ page }) => {
  const reportRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/report')) reportRequests.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/report/status');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('신고 처리현황 조회');
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /인증번호/ })).toHaveCount(0);
  const phone = page.getByLabel('휴대전화 번호', { exact: true });
  await phone.fill('010');
  await page.getByRole('button', { name: '신고내역 조회', exact: true }).click();
  expect(reportRequests).toEqual([]);
  await phone.fill('01000000000');
  await page.getByRole('button', { name: '신고내역 조회', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/report\/status$/);
  await expectNoHorizontalOverflow(page);
  await phone.fill('');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(reportRequests).toHaveLength(1);
  expect(new URL(reportRequests[0]).pathname).toBe('/api/reports/lookup');
  expect(reportRequests[0]).not.toContain('01000000000');
  await page.goto('/report/status/unknown-report');
  await expect(page.getByText('먼저 전화번호로 신고내역을 조회해 주세요')).toBeVisible();
});
