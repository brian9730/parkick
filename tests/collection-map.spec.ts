import { expect, test, type Page } from '@playwright/test';

const origin = { latitude: 37.322, longitude: 127.093 };
const coordinates = [
  [37.323, 127.094], [37.324, 127.095], [37.325, 127.096],
  [37.326, 127.097], [37.327, 127.098], [38.2, 128.2],
];
const reports = coordinates.map(([latitude, longitude], index) => ({
  publicId: `PK-20261025-${String(index + 1).padStart(12, '0')}`,
  operatorName: '지도 테스트 업체', deviceId: `SCOOTER-${index + 1}`,
  address: `테스트 위치 ${index + 1}`, categories: ['보행로 통행 방해'],
  latitude, longitude, distanceMeters: (index + 1) * 150,
  status: 'RECEIVED', completionMethod: null, completedAt: null,
  createdAt: '2026-10-25T01:00:00.000Z', updatedAt: '2026-10-25T01:00:00.000Z',
  tenant: { id: 'tenant-test', name: '경기도 용인' }, region: { id: 'region-test', name: '경기도 용인' },
}));

interface Position { lat(): number; lng(): number }
interface FitCall { southWest: [number, number]; northEast: [number, number]; maxZoom: number }
interface MapRecord {
  initialCenter: [number, number];
  fitCalls: FitCall[];
  setCenterCalls: Array<[number, number]>;
  zoom: number;
  destroyed: boolean;
}
interface PopupRecord { content: string; position: [number, number] | null; isOpen: boolean; opens: number }
interface CollectionMapMock { maps: MapRecord[]; popup: PopupRecord; installSdk(): void }
declare global { interface Window { __collectionMapMock: CollectionMapMock } }

async function mockNaver(page: Page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
    return route.fallback();
  });
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    expect(callback).toMatch(/^__parkickNaverMapsReady_\d+$/);
    return route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: `window.__collectionMapMock.installSdk(); window[${JSON.stringify(callback)}]();`,
    });
  });
  await page.addInitScript(() => {
    class LatLng implements Position {
      constructor(private latitude: number, private longitude: number) {}
      lat() { return this.latitude; }
      lng() { return this.longitude; }
    }
    class Bounds {
      constructor(readonly southWest: Position, readonly northEast: Position) {}
      getCenter() { return new LatLng((this.southWest.lat() + this.northEast.lat()) / 2, (this.southWest.lng() + this.northEast.lng()) / 2); }
    }
    class MapView implements MapRecord {
      initialCenter: [number, number];
      fitCalls: FitCall[] = [];
      setCenterCalls: Array<[number, number]> = [];
      zoom: number;
      destroyed = false;
      constructor(readonly element: HTMLElement, options: { center: Position; zoom: number }) {
        this.initialCenter = [options.center.lat(), options.center.lng()];
        this.zoom = options.zoom;
        window.__collectionMapMock.maps.push(this);
      }
      setCenter(position: Position) { this.setCenterCalls.push([position.lat(), position.lng()]); }
      setZoom(zoom: number) { this.zoom = zoom; }
      getZoom() { return this.zoom; }
      getMaxZoom() { return 22; }
      getProjection() { return { fromCoordToOffset: (position: Position) => ({ x: position.lng() * 100_000, y: position.lat() * 100_000 }) }; }
      fitBounds(bounds: Bounds, options: { maxZoom: number }) {
        this.fitCalls.push({
          southWest: [bounds.southWest.lat(), bounds.southWest.lng()],
          northEast: [bounds.northEast.lat(), bounds.northEast.lng()],
          maxZoom: options.maxZoom,
        });
      }
      autoResize() { /* No tiles in this SDK double. */ }
      destroy() { this.destroyed = true; this.element.replaceChildren(); }
    }
    class Marker {
      private readonly content: HTMLElement;
      private position: Position;
      constructor(options: { map: MapView; position: Position; icon: { content: HTMLElement } }) {
        this.content = options.icon.content;
        this.position = options.position;
        this.setMap(options.map);
      }
      getPosition() { return this.position; }
      setPosition(position: Position) { this.position = position; }
      setMap(map: MapView | null) { this.content.remove(); map?.element.append(this.content); }
    }
    class InfoWindow {
      setContent(content: HTMLElement) { window.__collectionMapMock.popup.content = content.textContent ?? ''; }
      open(_map: MapView, position: Position) {
        window.__collectionMapMock.popup.position = [position.lat(), position.lng()];
        window.__collectionMapMock.popup.isOpen = true;
        window.__collectionMapMock.popup.opens += 1;
      }
      close() { window.__collectionMapMock.popup.isOpen = false; }
    }
    window.__collectionMapMock = {
      maps: [],
      popup: { content: '', position: null, isOpen: false, opens: 0 },
      installSdk() {
        const sdk = {
          LatLng, LatLngBounds: Bounds, Map: MapView, Marker, InfoWindow,
          Point: class { constructor(readonly x: number, readonly y: number) {} },
          Event: { addListener: () => ({}), removeListener: () => {} },
          Service: {
            Status: { OK: 200 }, OrderType: { ROAD_ADDR: 'roadaddr', ADDR: 'addr' },
            reverseGeocode: () => {},
          },
        };
        (window as Window & { naver?: { maps: typeof sdk } }).naver = { maps: sdk };
      },
    };
  });
}

test('collection map fits current position with five nearest reports and keeps an empty queue centered', async ({ page }) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ ...origin, accuracy: 15 });
  await mockNaver(page);
  let activeReports = reports;
  await page.route('http://localhost:5188/api/**', route => route.abort());
  await page.route('**/api/admin/auth/me', route => route.fulfill({ json: { data: {
    admin: { id: 'admin-test', email: 'collector@example.invalid', name: '수거 담당자', role: 'PLATFORM_ADMIN', tenantId: null },
    mode: 'database',
  } } }));
  await page.route('**/api/admin/dashboard', route => route.fulfill({ json: { data: {
    mode: 'database', summary: { today: 0, total: 0, received: 0, processing: 0, completed: 0, rejected: 0 }, recentReports: [],
  } } }));
  await page.route('**/api/admin/reports/map**', route => route.fulfill({ json: { data: {
    mode: 'database', items: [], total: 0, page: 1, pageSize: 200,
  } } }));
  await page.route('**/api/admin/reports/nearby**', route => route.fulfill({ json: { data: {
    mode: 'database', items: activeReports, total: activeReports.length, page: 1, pageSize: 50,
  } } }));

  await page.goto('/admin/dashboard');
  await page.getByRole('button', { name: '수거 모드', exact: true }).click();
  await expect(page.getByRole('button', { name: '현재 위치와 가까운 신고 보기' })).toBeVisible();
  await expect(page.getByRole('img', { name: '현재 위치' })).toBeVisible();
  expect(await page.evaluate(() => window.__collectionMapMock.maps.at(-1))).toMatchObject({
    initialCenter: [origin.latitude, origin.longitude],
    fitCalls: [{ southWest: [origin.latitude, origin.longitude], northEast: coordinates[4], maxZoom: 17 }],
  });
  await page.getByRole('button', { name: '현재 위치와 가까운 신고 보기' }).click();
  expect(await page.evaluate(() => window.__collectionMapMock.maps.at(-1)?.fitCalls)).toHaveLength(2);

  const target = reports[1];
  const targetButton = page.getByRole('region', { name: '거리순 수거 대상 신고 목록' })
    .getByRole('button', { name: `${target.publicId} 신고 위치 지도에서 보기` });
  await targetButton.click();
  await expect(targetButton).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__collectionMapMock.maps.at(-1)?.setCenterCalls.at(-1))).toEqual(coordinates[1]);
  expect(await page.evaluate(() => window.__collectionMapMock.maps.at(-1)?.zoom)).toBe(19);
  expect(await page.evaluate(() => window.__collectionMapMock.popup)).toMatchObject({
    position: coordinates[1], isOpen: true, opens: 1,
  });
  expect(await page.evaluate(() => window.__collectionMapMock.popup.content)).toContain(target.publicId);
  expect(await page.evaluate(() => window.__collectionMapMock.popup.content)).not.toContain(reports[0].publicId);
  await targetButton.click();
  expect(await page.evaluate(() => window.__collectionMapMock.popup.opens)).toBe(2);
  await expect(page.getByRole('region', { name: '거리순 수거 대상 신고 목록' }).getByRole('link', { name: '신고 상세 보기' })).toHaveCount(reports.length);

  activeReports = [];
  await page.getByRole('button', { name: '관리 모드', exact: true }).click();
  await page.getByRole('button', { name: '수거 모드', exact: true }).click();
  await expect(page.getByRole('button', { name: '현재 위치로 이동' })).toBeVisible();
  await expect(page.getByRole('img', { name: '현재 위치' })).toBeVisible();
  expect(await page.evaluate(() => window.__collectionMapMock.maps.at(-1))).toMatchObject({
    initialCenter: [origin.latitude, origin.longitude],
    fitCalls: [], setCenterCalls: [[origin.latitude, origin.longitude]], zoom: 17,
  });
});
