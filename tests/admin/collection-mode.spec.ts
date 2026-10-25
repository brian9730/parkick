import { expect, test, type Page } from '@playwright/test';

const reports = [
  { publicId: 'PK-20261025-aaaaaaaaaaaa', operatorName: '알파카', deviceId: 'ALP-101', address: '경기도 용인시 수지구 풍덕천동 1', categories: ['보행로 통행 방해'], latitude: 37.323, longitude: 127.094, distanceMeters: 240 },
  { publicId: 'PK-20261025-bbbbbbbbbbbb', operatorName: '지쿠터', deviceId: 'GCT-202', address: '경기도 용인시 수지구 풍덕천동 2', categories: ['점자블록 위 주차'], latitude: 37.327, longitude: 127.099, distanceMeters: 780 },
  { publicId: 'PK-20261025-cccccccccccc', operatorName: '씽씽', deviceId: 'SS-303', address: '경기도 용인시 수지구 풍덕천동 3', categories: ['차도 위 방치'], latitude: 37.335, longitude: 127.107, distanceMeters: 1630 },
].map(report => ({
  ...report,
  status: 'RECEIVED', completionMethod: null, completedAt: null,
  createdAt: '2026-10-25T01:00:00.000Z', updatedAt: '2026-10-25T01:00:00.000Z',
  tenant: { id: 'tenant-test', name: '경기도 용인' }, region: { id: 'region-test', name: '경기도 용인' },
}));

async function mockAdminDashboard(page: Page) {
  await page.route('**/api/admin/auth/me', route => route.fulfill({ json: { data: {
    admin: { id: 'admin-test', email: 'collector@example.invalid', name: '수거 담당자', role: 'PLATFORM_ADMIN', tenantId: null },
    mode: 'database',
  } } }));
  await page.route('**/api/admin/dashboard', route => route.fulfill({ json: { data: {
    mode: 'database', summary: { today: 3, total: 3, received: 3, processing: 0, completed: 0, rejected: 0 }, recentReports: [],
  } } }));
  await page.route('**/api/admin/reports/map**', route => route.fulfill({ json: { data: {
    mode: 'database', items: [], total: 0, page: 1, pageSize: 200,
  } } }));
}

test.beforeEach(async ({ page }) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.322, longitude: 127.093, accuracy: 15 });
  await mockAdminDashboard(page);
});

test('switches between management and collection modes and shows nearest reports with collection details', async ({ page }, testInfo) => {
  const requests: URL[] = [];
  await page.route('**/api/admin/reports/nearby**', route => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ json: { data: { mode: 'database', items: reports, total: reports.length, page: 1, pageSize: 50 } } });
  });

  await page.goto('/admin/dashboard');
  await expect(page.getByRole('button', { name: '관리 모드', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '수거 모드', exact: true })).toBeVisible();
  await expect(page.getByLabel('신고 핵심 현황')).toBeVisible();

  await page.getByRole('button', { name: '수거 모드', exact: true }).click();
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' })).toBeVisible();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(Number(requests[0].searchParams.get('latitude'))).toBeCloseTo(37.322, 3);
  expect(Number(requests[0].searchParams.get('longitude'))).toBeCloseTo(127.093, 3);

  const reportLinks = page.locator('main a[href^="/admin/reports/PK-"]');
  await expect(reportLinks).toHaveCount(3);
  expect(await reportLinks.evaluateAll(links => links.map(link => (link as HTMLAnchorElement).pathname.split('/').at(-1)))).toEqual(reports.map(report => report.publicId));
  for (const report of reports) {
    await expect(page.getByText(report.operatorName, { exact: true })).toBeVisible();
    await expect(page.getByText(report.deviceId, { exact: true })).toBeVisible();
    await expect(page.getByText(report.address, { exact: true })).toBeVisible();
    await expect(page.getByText(report.categories[0], { exact: true })).toBeVisible();
  }
  await expect(page.getByText(/240\s*m|240\s*미터/)).toBeVisible();
  await expect(page.getByText(/780\s*m|780\s*미터/)).toBeVisible();
  await expect(page.getByText(/1[.,]6\s*km|1[.,]6\s*킬로미터/)).toBeVisible();
  await expect(page.getByLabel('신고 핵심 현황')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('collection-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('collection-mobile.png'), fullPage: true });

  await page.getByRole('button', { name: '관리 모드', exact: true }).click();
  await expect(page.getByLabel('신고 핵심 현황')).toBeVisible();
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' })).toHaveCount(0);
});

test('shows an empty collection queue when there are no open reports', async ({ page }) => {
  await page.route('**/api/admin/reports/nearby**', route => route.fulfill({ json: { data: {
    mode: 'database', items: [], total: 0, page: 1, pageSize: 50,
  } } }));
  await page.goto('/admin/dashboard');
  await page.getByRole('button', { name: '수거 모드', exact: true }).click();
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' })).toBeVisible();
  await expect(page.getByText(/수거할 신고가 없|접수된 신고가 없/)).toBeVisible();
  await expect(page.getByText(/위치를 확인할 수 없|위치 권한이 거부/)).toHaveCount(0);
});
