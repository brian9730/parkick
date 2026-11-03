import { expect, test, type Page } from '@playwright/test';

const firstId = 'PK-20261025-aaaaaaaaaaaa';
const nextId = 'PK-20261025-bbbbbbbbbbbb';
const createdAt = '2026-10-25T01:00:00.000Z';
const updatedAt = '2026-10-25T02:00:00.000Z';
const queue = [firstId, nextId].map((publicId, index) => ({
  publicId, operatorName: index ? '지쿠터' : '알파카', deviceId: index ? 'GCT-202' : 'ALP-101',
  address: `용인시 수지구 풍덕천동 ${index + 1}`, categories: ['보행로 통행 방해'],
  latitude: 37.323 + index * 0.004, longitude: 127.094 + index * 0.005,
  distanceMeters: index ? 780 : 240, status: 'RECEIVED', completionMethod: null,
  completedAt: null, hasPendingFieldFinding: false, createdAt, updatedAt,
  tenant: { id: 'tenant-test', name: '용인시' }, region: { id: 'region-test', name: '수지구' },
}));

const evidence = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#d5e1ec"/></svg>';

function detailFor(report: typeof queue[number]) {
  return {
    ...report,
    finalReportText: '보행로를 막고 있는 공유 킥보드입니다.',
    userDescription: '현장 사진과 기기번호를 확인해 주세요.',
    images: [{ id: 'evidence-1', url: `/api/admin/collection/reports/${report.publicId}/images/evidence-1` }],
    history: [{ id: 'history-1', status: 'RECEIVED', createdAt, completionMethod: null, publicNote: null, adminName: null }],
    fieldFindings: [],
  };
}

async function mockCollectorApi(page: Page, queuePage = 1) {
  const details = new Map(queue.map(report => [report.publicId, detailFor(report)]));
  const writes: { path: string; payload: Record<string, unknown> }[] = [];
  const nearbyRequests: URL[] = [];
  const unexpectedRequests: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (!path.startsWith('/api/')) return route.continue();
    const respond = (data: unknown) => route.fulfill({ json: { data } });
    if (path === '/api/admin/auth/me') return respond({
      admin: { id: 'collector-test', email: 'collector@example.invalid', name: '수거 담당자', role: 'COLLECTOR', tenantId: 'tenant-test' },
      mode: 'database',
    });
    if (path === '/api/admin/collection/reports/nearby' && request.method() === 'GET') {
      nearbyRequests.push(url);
      const requestedPage = Number(url.searchParams.get('page'));
      const items = requestedPage === queuePage
        ? [...details.values()].filter(report => (report.status === 'RECEIVED' || report.status === 'PROCESSING') && !report.hasPendingFieldFinding)
          .map(({ images, history, fieldFindings, finalReportText, userDescription, ...summary }) => {
            void images; void history; void fieldFindings; void finalReportText; void userDescription;
            return summary;
          })
        : [];
      return respond({ mode: 'database', items, total: (queuePage - 1) * 50 + items.length, page: requestedPage, pageSize: 50 });
    }
    const image = path.match(/^\/api\/admin\/collection\/reports\/(PK-[^/]+)\/images\/evidence-1$/);
    if (image) return route.fulfill({ body: evidence, contentType: 'image/svg+xml' });
    const detail = path.match(/^\/api\/admin\/collection\/reports\/(PK-[^/]+)$/);
    if (detail && request.method() === 'GET' && details.has(detail[1])) return respond(details.get(detail[1]));
    const missing = path.match(/^\/api\/admin\/collection\/reports\/(PK-[^/]+)\/missing$/);
    if (missing && request.method() === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      writes.push({ path, payload });
      const current = details.get(missing[1]);
      if (!current) return route.fulfill({ status: 404 });
      details.set(missing[1], { ...current, hasPendingFieldFinding: true, updatedAt: '2026-10-25T03:00:00.000Z',
        fieldFindings: [{ id: 'finding-1', type: 'DEVICE_NOT_FOUND', status: 'PENDING_REVIEW', note: payload.note,
          collectorName: '수거 담당자', createdAt: '2026-10-25T03:00:00.000Z' }] } as typeof current);
      return respond(details.get(missing[1]));
    }
    const complete = path.match(/^\/api\/admin\/collection\/reports\/(PK-[^/]+)\/complete$/);
    if (complete && request.method() === 'PATCH') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      writes.push({ path, payload });
      const current = details.get(complete[1]);
      if (!current) return route.fulfill({ status: 404 });
      details.set(complete[1], { ...current, status: 'COMPLETED', completionMethod: 'COLLECTED',
        completedAt: '2026-10-25T03:00:00.000Z', updatedAt: '2026-10-25T03:00:00.000Z' });
      return respond(details.get(complete[1]));
    }
    unexpectedRequests.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 404, json: { error: { message: 'Unexpected mocked API request' } } });
  });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.322, longitude: 127.093, accuracy: 15 });
  return { writes, nearbyRequests, unexpectedRequests };
}

async function openDetail(page: Page, publicId: string, queuePage = 1) {
  await page.goto(`/collect${queuePage > 1 ? `?page=${queuePage}` : ''}`);
  const list = page.getByRole('region', { name: '거리순 수거 대상 신고 목록' });
  await expect(list).toBeVisible();
  await list.getByRole('listitem').filter({ has: page.getByRole('button', { name: `${publicId} 신고 위치 지도에서 보기` }) })
    .getByRole('link', { name: '신고 상세 보기' }).click();
  await expect(page.getByRole('heading', { name: '현장 신고 확인' })).toBeVisible();
}

test('mobile collector queue starts with the list and restores the previous page after detail', async ({ page }) => {
  const api = await mockCollectorApi(page, 2);
  await openDetail(page, firstId, 2);
  await expect(page).toHaveURL(new RegExp(`/collect/reports/${firstId}`));
  expect(api.nearbyRequests[0].searchParams.get('page')).toBe('2');
  expect(Number(api.nearbyRequests[0].searchParams.get('latitude'))).toBeCloseTo(37.322, 3);
  await expect(page.getByText('010-****-1234')).toHaveCount(0);
  await page.getByRole('link', { name: '수거 목록으로' }).click();
  await expect(page).toHaveURL(/\/collect\?focus=PK-20261025-aaaaaaaaaaaa&page=2$/);
  expect(api.unexpectedRequests).toEqual([]);
});

test('device-not-found is recorded for manager review without rejecting the report', async ({ page }) => {
  const api = await mockCollectorApi(page);
  await openDetail(page, firstId);
  await page.getByRole('button', { name: '현장에 기기 없음 기록' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('현장 확인 메모').fill('현장에 기기가 없어 재확인이 필요합니다.');
  await page.getByRole('button', { name: '현장에 기기 없음 기록' }).click();
  await expect(page.getByRole('dialog', { name: '현장 처리 확인' })).toContainText('관리자가 검토한 뒤 최종 반려합니다.');
  await page.getByRole('dialog', { name: '현장 처리 확인' }).getByRole('button', { name: '기록 확인' }).click();
  await expect(page).toHaveURL(/\/collect\?/);
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' }).getByText(nextId)).toBeVisible();
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' }).getByText(firstId)).toHaveCount(0);
  expect(api.writes).toEqual([{ path: `/api/admin/collection/reports/${firstId}/missing`,
    payload: { expectedUpdatedAt: updatedAt, note: '현장에 기기가 없어 재확인이 필요합니다.' } }]);
  expect(api.unexpectedRequests).toEqual([]);
});

test('collector completion records collection and removes the item from the queue', async ({ page }) => {
  const api = await mockCollectorApi(page);
  await openDetail(page, firstId);
  await page.getByRole('button', { name: '수거 완료' }).click();
  await page.getByRole('dialog', { name: '현장 처리 확인' }).getByRole('button', { name: '기록 확인' }).click();
  await expect(page).toHaveURL(/\/collect\?/);
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' }).getByText(nextId)).toBeVisible();
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' }).getByText(firstId)).toHaveCount(0);
  expect(api.writes).toEqual([{ path: `/api/admin/collection/reports/${firstId}/complete`,
    payload: { expectedUpdatedAt: updatedAt } }]);
  expect(api.unexpectedRequests).toEqual([]);
});
