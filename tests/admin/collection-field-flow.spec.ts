import { expect, test, type Page } from '@playwright/test';
import type { AdminReportDetail, NearbyReport, ReportStatusUpdate } from '../../frontend/src/api/admin';

const firstId = 'PK-20261025-aaaaaaaaaaaa';
const nextId = 'PK-20261025-bbbbbbbbbbbb';
const createdAt = '2026-10-25T01:00:00.000Z';
const updatedAt = '2026-10-25T02:00:00.000Z';

const queue: NearbyReport[] = [
  { publicId: firstId, operatorName: '알파카', deviceId: 'ALP-101', address: '용인시 수지구 풍덕천동 1', categories: ['보행로 통행 방해'], latitude: 37.323, longitude: 127.094, distanceMeters: 240 },
  { publicId: nextId, operatorName: '지쿠터', deviceId: 'GCT-202', address: '용인시 수지구 풍덕천동 2', categories: ['점자블록 위 주차'], latitude: 37.327, longitude: 127.099, distanceMeters: 780 },
].map(report => ({
  ...report, status: 'RECEIVED', completionMethod: null, completedAt: null,
  createdAt, updatedAt,
  tenant: { id: 'tenant-test', name: '용인시' }, region: { id: 'region-test', name: '수지구' },
}));

const evidence = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#d5e1ec"/><path d="M50 300h540" stroke="#657b90" stroke-width="18"/><rect x="205" y="156" width="260" height="110" rx="20" fill="#395a7d"/><circle cx="260" cy="280" r="30" fill="#1f3045"/><circle cx="410" cy="280" r="30" fill="#1f3045"/><text x="320" y="100" text-anchor="middle" font-size="42" fill="#18395c">BEFORE</text></svg>`;

function detailFor(report: NearbyReport): AdminReportDetail {
  return {
    ...report,
    finalReportText: '보행로를 막고 있는 공유 킥보드입니다.',
    userDescription: '현장 사진과 기기번호를 확인해 주세요.',
    contactPhoneMasked: '010-****-1234',
    images: [{ id: 'evidence-1', url: `/api/admin/reports/${report.publicId}/images/evidence-1` }],
    history: [{ id: 'history-1', status: 'RECEIVED', createdAt, completionMethod: null, publicNote: null, internalNote: null, adminName: null }],
  };
}

async function mockCollectionApi(page: Page, queuePage: number) {
  const details = new Map(queue.map(report => [report.publicId, detailFor(report)]));
  const updates: { publicId: string; payload: ReportStatusUpdate }[] = [];
  const nearbyRequests: URL[] = [];
  const unexpectedRequests: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    // The glob also matches Vite source modules such as /src/api/admin.ts.
    if (!path.startsWith('/api/')) return route.continue();
    const respond = (data: unknown) => route.fulfill({ json: { data } });
    if (path === '/api/admin/auth/me') {
      return respond({ admin: { id: 'admin-test', email: 'collector@example.invalid', name: '수거 담당자', role: 'PLATFORM_ADMIN', tenantId: null }, mode: 'database' });
    }
    if (path === '/api/admin/dashboard') return respond({ mode: 'database', summary: { today: 2, total: 2, received: 2, processing: 0, completed: 0, rejected: 0 }, recentReports: [] });
    if (path === '/api/admin/reports/map') return respond({ mode: 'database', items: [], total: 0, page: 1, pageSize: 200 });
    if (path === '/api/admin/reports/nearby' && request.method() === 'GET') {
      nearbyRequests.push(url);
      const requestedPage = Number(url.searchParams.get('page'));
      const items = requestedPage === queuePage ? [...details.values()].filter(report => report.status === 'RECEIVED' || report.status === 'PROCESSING').map(report => ({
        ...report, images: undefined, history: undefined, finalReportText: undefined, userDescription: undefined, contactPhoneMasked: undefined,
      })) : [];
      return respond({ mode: 'database', items, total: (queuePage - 1) * 50 + items.length, page: requestedPage, pageSize: 50 });
    }
    const image = path.match(/^\/api\/admin\/reports\/(PK-[^/]+)\/images\/evidence-1$/);
    if (image) return route.fulfill({ body: evidence, contentType: 'image/svg+xml' });
    const related = path.match(/^\/api\/admin\/reports\/(PK-[^/]+)\/related$/);
    if (related) return respond({ anchorPublicId: related[1], eligible: true, reason: null, criteria: { distanceMeters: 100, timeWindowHours: 24, maxSelection: 100 }, items: [], truncated: false });
    const status = path.match(/^\/api\/admin\/reports\/(PK-[^/]+)\/status$/);
    if (status && request.method() === 'PATCH') {
      const report = details.get(status[1]);
      if (!report) return route.fulfill({ status: 404, json: { error: { message: 'Unknown report' } } });
      const payload = request.postDataJSON() as ReportStatusUpdate;
      updates.push({ publicId: status[1], payload });
      const revised: AdminReportDetail = {
        ...report,
        status: payload.status,
        completionMethod: payload.completionMethod ?? null,
        completedAt: payload.status === 'COMPLETED' ? '2026-10-25T03:00:00.000Z' : null,
        updatedAt: '2026-10-25T03:00:00.000Z',
        history: [...report.history, { id: 'history-2', status: payload.status, createdAt: '2026-10-25T03:00:00.000Z', completionMethod: payload.completionMethod ?? null, publicNote: payload.publicNote || null, internalNote: payload.internalNote || null, adminName: '수거 담당자' }],
      };
      details.set(status[1], revised);
      return respond(revised);
    }
    const detail = path.match(/^\/api\/admin\/reports\/(PK-[^/]+)$/);
    if (detail && request.method() === 'GET' && details.has(detail[1])) return respond(details.get(detail[1]));
    unexpectedRequests.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 404, json: { error: { message: 'Unexpected mocked API request' } } });
  });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.322, longitude: 127.093, accuracy: 15 });
  return { updates, nearbyRequests, unexpectedRequests };
}

async function openDetail(page: Page, publicId: string, queuePage = 1) {
  await page.goto(`/admin/dashboard?mode=collect${queuePage > 1 ? `&page=${queuePage}` : ''}`);
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' })).toBeVisible();
  await page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `${publicId} 신고 위치 지도에서 보기` }) }).getByRole('link', { name: '신고 상세 보기' }).click();
  await expect(page.getByRole('heading', { name: '현장 신고 확인' })).toBeVisible();
}

test('mobile queue starts with the list, opens the map on demand, and restores page and focus after detail', async ({ page }, testInfo) => {
  const api = await mockCollectionApi(page, 2);
  await page.goto('/admin/dashboard?mode=collect&page=2');
  const list = page.getByRole('region', { name: '거리순 수거 대상 신고 목록' });
  const map = page.getByRole('region', { name: '수거 대상 신고 지도' });
  await expect(list).toBeVisible();
  await expect(map).toHaveCount(0);
  await expect(list.getByRole('button', { name: `${firstId} 신고 위치 지도에서 보기` })).toBeVisible();
  await expect(list.getByRole('button', { name: `${nextId} 신고 위치 지도에서 보기` })).toBeVisible();
  await expect(list.getByRole('button', { name: '도보 길찾기' })).toHaveCount(2);
  await expect(list.getByRole('button', { name: '차량 길찾기' })).toHaveCount(2);
  expect(api.nearbyRequests[0].searchParams.get('page')).toBe('2');
  expect(Number(api.nearbyRequests[0].searchParams.get('latitude'))).toBeCloseTo(37.322, 3);
  await page.screenshot({ path: testInfo.outputPath('queue-mobile.png'), fullPage: true });

  await page.getByRole('button', { name: '지도 보기' }).click();
  await expect(map).toBeVisible();
  expect((await map.boundingBox())!.y).toBeLessThan((await list.boundingBox())!.y);
  await page.getByRole('button', { name: '지도 접기' }).first().click();
  await expect(map).toHaveCount(0);

  await list.getByRole('listitem').filter({ has: page.getByRole('button', { name: `${firstId} 신고 위치 지도에서 보기` }) }).getByRole('link', { name: '신고 상세 보기' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/reports/${firstId}\\?from=collection`));
  const returnTo = new URL(page.url()).searchParams.get('returnTo');
  expect(returnTo).toBe(`/admin/dashboard?mode=collect&focus=${firstId}&page=2`);
  await expect(page.getByRole('heading', { name: '현장 신고 확인' })).toBeVisible();
  await page.getByRole('link', { name: '수거 목록으로' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/dashboard\\?mode=collect&focus=${firstId}&page=2$`));
  await expect(list.getByRole('button', { name: `${firstId} 신고 위치 지도에서 보기` })).toHaveAttribute('aria-pressed', 'true');
  await expect(map).toHaveCount(0);
  expect(api.unexpectedRequests).toEqual([]);
});

test('evidence appears before field actions and rejection requires a public reason', async ({ page }, testInfo) => {
  const api = await mockCollectionApi(page, 1);
  await openDetail(page, firstId);
  const photo = page.getByRole('img', { name: '신고 현장사진 1' });
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const summary = page.locator('.admin-detail-summary');
  const photos = page.locator('.admin-detail-photos');
  const actions = page.locator('.collection-status-form');
  const more = page.locator('.admin-detail-more');
  expect((await summary.boundingBox())!.y).toBeLessThan((await photos.boundingBox())!.y);
  expect((await photos.boundingBox())!.y).toBeLessThan((await actions.boundingBox())!.y);
  expect((await actions.boundingBox())!.y).toBeLessThan((await more.boundingBox())!.y);
  await page.screenshot({ path: testInfo.outputPath('detail-mobile.png'), fullPage: true });

  await actions.getByRole('button', { name: '반려', exact: true }).click();
  await expect(actions.getByRole('alert')).toContainText('반려 사유를 공개 처리 메모에 입력해 주세요');
  expect(api.updates).toHaveLength(0);
  await actions.getByRole('button', { name: '반려 사유 빠르게 입력' }).click();
  await expect(actions.getByLabel('공개 처리 메모')).toHaveValue('현장에 기기가 없어 수거하지 못했습니다.');
  await actions.getByRole('button', { name: '반려', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '처리 상태 변경 확인' });
  await expect(dialog).toContainText('현장에 기기가 없어 수거하지 못했습니다.');
  await dialog.getByRole('button', { name: '변경 확인' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/dashboard\\?mode=collect&focus=${firstId}$`));
  await expect(page.getByRole('status').filter({ hasText: '신고를 반려했습니다' })).toBeVisible();
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' }).getByText(nextId)).toBeVisible();
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' }).getByText(firstId)).toHaveCount(0);
  expect(api.updates).toEqual([{ publicId: firstId, payload: {
    status: 'REJECTED', publicNote: '현장에 기기가 없어 수거하지 못했습니다.', internalNote: '', expectedUpdatedAt: updatedAt,
  } }]);
  expect(api.unexpectedRequests).toEqual([]);
});

test('collection completion records COLLECTED and returns to the next queued report', async ({ page }) => {
  const api = await mockCollectionApi(page, 1);
  await openDetail(page, firstId);
  const actions = page.locator('.collection-status-form');
  await actions.getByLabel('공개 처리 메모').fill('현장에서 수거했습니다.');
  await actions.getByRole('button', { name: '수거 완료' }).click();
  const dialog = page.getByRole('dialog', { name: '처리 상태 변경 확인' });
  await expect(dialog).toContainText('수거 완료');
  await dialog.getByRole('button', { name: '변경 확인' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/dashboard\\?mode=collect&focus=${firstId}$`));
  await expect(page.getByRole('status').filter({ hasText: '수거 완료로 저장했습니다' })).toBeVisible();
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' }).getByText(nextId)).toBeVisible();
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' }).getByText(firstId)).toHaveCount(0);
  expect(api.updates).toEqual([{ publicId: firstId, payload: {
    status: 'COMPLETED', completionMethod: 'COLLECTED', publicNote: '현장에서 수거했습니다.', internalNote: '', expectedUpdatedAt: updatedAt,
  } }]);
  expect(api.unexpectedRequests).toEqual([]);
});

test('location watch refreshes nearby reports after movement and stops when collection mode closes', async ({ page }) => {
  const api = await mockCollectionApi(page, 1);
  await page.addInitScript(() => {
    const watches = new Map<number, PositionCallback>();
    let nextId = 0;
    let clearCount = 0;
    const position = (latitude: number, longitude: number, timestamp: number) => ({
      coords: { latitude, longitude, accuracy: 15 }, timestamp,
    }) as GeolocationPosition;
    const harness = {
      emit(latitude: number, longitude: number, timestamp: number) {
        for (const callback of watches.values()) callback(position(latitude, longitude, timestamp));
      },
      activeCount: () => watches.size,
      clearCount: () => clearCount,
    };
    Object.defineProperty(window, '__collectionGeo', { value: harness });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(callback: PositionCallback) {
        const id = ++nextId;
        watches.set(id, callback);
        queueMicrotask(() => { if (watches.has(id)) callback(position(37.322, 127.093, Date.now())); });
        return id;
      },
      clearWatch(id: number) { watches.delete(id); clearCount += 1; },
      getCurrentPosition(callback: PositionCallback) { callback(position(37.322, 127.093, Date.now())); },
    } });
  });
  await page.goto('/admin/dashboard?mode=collect');
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' })).toBeVisible();
  await expect.poll(() => api.nearbyRequests.length).toBeGreaterThan(0);
  const beforeMovement = api.nearbyRequests.length;
  await page.evaluate(() => (window as typeof window & { __collectionGeo: { emit: (latitude: number, longitude: number, timestamp: number) => void } }).__collectionGeo.emit(37.324, 127.095, Date.now() + 16_000));
  await expect.poll(() => api.nearbyRequests.length).toBeGreaterThan(beforeMovement);
  expect(Number(api.nearbyRequests.at(-1)!.searchParams.get('latitude'))).toBeCloseTo(37.324, 3);
  expect(Number(api.nearbyRequests.at(-1)!.searchParams.get('longitude'))).toBeCloseTo(127.095, 3);

  await page.getByRole('button', { name: '관리 모드', exact: true }).click();
  await expect(page.getByLabel('신고 핵심 현황')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __collectionGeo: { activeCount: () => number } }).__collectionGeo.activeCount())).toBe(0);
  expect(await page.evaluate(() => (window as typeof window & { __collectionGeo: { clearCount: () => number } }).__collectionGeo.clearCount())).toBeGreaterThan(0);
  const afterLeaving = api.nearbyRequests.length;
  await page.evaluate(() => (window as typeof window & { __collectionGeo: { emit: (latitude: number, longitude: number, timestamp: number) => void } }).__collectionGeo.emit(37.33, 127.10, Date.now() + 32_000));
  expect(api.nearbyRequests).toHaveLength(afterLeaving);
  expect(api.unexpectedRequests).toEqual([]);
});
