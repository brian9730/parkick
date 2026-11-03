import { expect, test, type Page } from '@playwright/test';

const reports = [
  { publicId: 'PK-20261025-aaaaaaaaaaaa', operatorName: '알파카', deviceId: 'ALP-101', address: '경기도 용인시 수지구 풍덕천동 1', categories: ['보행로 통행 방해'], latitude: 37.323, longitude: 127.094, distanceMeters: 240 },
  { publicId: 'PK-20261025-bbbbbbbbbbbb', operatorName: '지쿠터', deviceId: 'GCT-202', address: '경기도 용인시 수지구 풍덕천동 2', categories: ['점자블록 위 주차'], latitude: 37.327, longitude: 127.099, distanceMeters: 780 },
].map(report => ({
  ...report, status: 'RECEIVED', completionMethod: null, completedAt: null, hasPendingFieldFinding: false,
  createdAt: '2026-10-25T01:00:00.000Z', updatedAt: '2026-10-25T01:00:00.000Z',
  tenant: { id: 'tenant-test', name: '경기도 용인' }, region: { id: 'region-test', name: '경기도 용인' },
}));

async function mockStaff(page: Page, role: 'TENANT_ADMIN' | 'COLLECTOR') {
  await page.route('**/api/admin/auth/me', route => route.fulfill({ json: { data: {
    admin: { id: 'staff-test', email: 'staff@example.invalid', name: role === 'COLLECTOR' ? '수거 담당자' : '관리자', role, tenantId: 'tenant-test' },
    mode: 'database',
  } } }));
  await page.route('**/api/admin/dashboard', route => route.fulfill({ json: { data: {
    mode: 'database', summary: { today: 2, total: 2, received: 2, processing: 0, completed: 0, rejected: 0 }, recentReports: [],
  } } }));
  await page.route('**/api/admin/reports/map**', route => route.fulfill({ json: { data: {
    mode: 'database', items: [], total: 0, page: 1, pageSize: 200,
  } } }));
}

test.beforeEach(async ({ page }) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.322, longitude: 127.093, accuracy: 15 });
});

test('manager dashboard has no collector toggle and cannot enter collector screen', async ({ page }) => {
  await mockStaff(page, 'TENANT_ADMIN');
  await page.goto('/admin/dashboard');
  await expect(page.getByLabel('신고 핵심 현황')).toBeVisible();
  await expect(page.getByRole('button', { name: '수거 모드', exact: true })).toHaveCount(0);
  await page.goto('/collect');
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});

test('collector has a dedicated nearby queue and cannot enter manager dashboard', async ({ page }, testInfo) => {
  await mockStaff(page, 'COLLECTOR');
  const requests: URL[] = [];
  await page.route('**/api/admin/collection/reports/nearby**', route => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ json: { data: { mode: 'database', items: reports, total: reports.length, page: 1, pageSize: 50 } } });
  });
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/collect$/);
  const list = page.getByRole('region', { name: '거리순 수거 대상 신고 목록' });
  await expect(list).toBeVisible();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(Number(requests[0].searchParams.get('latitude'))).toBeCloseTo(37.322, 3);
  expect(Number(requests[0].searchParams.get('longitude'))).toBeCloseTo(127.093, 3);
  await expect(list.locator('a[href^="/collect/reports/PK-"]')).toHaveCount(2);
  for (const report of reports) {
    await expect(list.getByText(report.operatorName, { exact: true })).toBeVisible();
    await expect(list.getByText(report.deviceId, { exact: true })).toBeVisible();
    await expect(list.getByText(report.address, { exact: true })).toBeVisible();
  }
  await expect(page.getByLabel('신고 핵심 현황')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('collection-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('collection-mobile.png'), fullPage: true });
});

test('collector sees an empty state when no report needs collection', async ({ page }) => {
  await mockStaff(page, 'COLLECTOR');
  await page.route('**/api/admin/collection/reports/nearby**', route => route.fulfill({ json: { data: {
    mode: 'database', items: [], total: 0, page: 1, pageSize: 50,
  } } }));
  await page.goto('/collect');
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' })).toBeVisible();
  await expect(page.getByText(/수거할 신고가 없|접수된 신고가 없/)).toBeVisible();
});
