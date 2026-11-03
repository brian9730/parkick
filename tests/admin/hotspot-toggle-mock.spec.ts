import { expect, test, type Page } from '@playwright/test';

interface Position { lat(): number; lng(): number }
interface MapRecord { destroyed: boolean; element: HTMLElement }
interface HotspotMock {
  maps: MapRecord[];
  reportMarkers: HTMLElement[];
  initialReportMarkers: HTMLElement[];
  installSdk(): void;
}
declare global { interface Window { __hotspotMock: HotspotMock } }

const center = { latitude: 37.5665, longitude: 126.9780 };
const reports = [
  ...Array.from({ length: 5 }, (_, index) => ({
    latitude: center.latitude + index * 0.00003,
    longitude: center.longitude + index * 0.00003,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    latitude: 37.5865 + index * 0.00003,
    longitude: 126.9980 + index * 0.00003,
  })),
].map((coordinates, index) => ({
  publicId: `PK-20261025-${String(index + 1).padStart(12, '0')}`,
  operatorName: 'Test operator',
  deviceId: `SCOOTER-${index + 1}`,
  address: `Test address ${index + 1}`,
  categories: ['Sidewalk obstruction'],
  ...coordinates,
  status: 'RECEIVED',
  completionMethod: null,
  completedAt: null,
  createdAt: '2026-10-25T01:00:00.000Z',
  updatedAt: '2026-10-25T01:00:00.000Z',
  tenant: { id: 'tenant-test', name: 'Test tenant' },
  region: { id: 'region-test', name: 'Test region' },
}));

async function mockNaverSdk(page: Page) {
  const sdkRequests: string[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
    return route.fallback();
  });
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js**', route => {
    const url = new URL(route.request().url());
    sdkRequests.push(url.toString());
    expect(url.searchParams.get('ncpKeyId')).toBe('parkick-hotspot-sdk-test-only');
    const callback = url.searchParams.get('callback');
    expect(callback).toMatch(/^__parkickNaverMapsReady_\d+$/);
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.__hotspotMock.installSdk(); window[${JSON.stringify(callback)}]();`,
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
      getCenter() {
        return new LatLng((this.southWest.lat() + this.northEast.lat()) / 2,
          (this.southWest.lng() + this.northEast.lng()) / 2);
      }
    }
    class MapView implements MapRecord {
      destroyed = false;
      private zoom: number;
      private center: Position;
      constructor(readonly element: HTMLElement, options: { center: Position; zoom: number }) {
        this.center = options.center;
        this.zoom = options.zoom;
        window.__hotspotMock.maps.push(this);
      }
      setCenter(position: Position) { this.center = position; }
      setZoom(zoom: number) { this.zoom = zoom; }
      getZoom() { return this.zoom; }
      getMaxZoom() { return 22; }
      getProjection() {
        return { fromCoordToOffset: (position: Position) => ({
          x: (position.lng() - this.center.lng()) * 100_000 * 2 ** (this.zoom - 17),
          y: (position.lat() - this.center.lat()) * 100_000 * 2 ** (this.zoom - 17),
        }) };
      }
      fitBounds(bounds: Bounds, options: { maxZoom: number }) {
        this.center = bounds.getCenter();
        this.zoom = Math.min(17, options.maxZoom);
      }
      autoResize() { /* No tiles in this SDK double. */ }
      destroy() { this.destroyed = true; this.element.replaceChildren(); }
    }
    class Marker {
      readonly content: HTMLElement;
      private position: Position;
      constructor(options: { map: MapView; position: Position; icon: { content: HTMLElement } }) {
        this.content = options.icon.content;
        this.position = options.position;
        if (this.content.classList.contains('admin-map-marker')) {
          window.__hotspotMock.reportMarkers.push(this.content);
        }
        this.setMap(options.map);
      }
      getPosition() { return this.position; }
      setPosition(position: Position) { this.position = position; }
      setMap(map: MapView | null) {
        this.content.remove();
        map?.element.append(this.content);
      }
    }
    class Circle {
      readonly element = document.createElement('div');
      constructor(options: { map: MapView; radius: number; fillColor: string }) {
        this.element.dataset.testMapCircle = String(options.radius);
        this.element.dataset.fillColor = options.fillColor;
        this.setMap(options.map);
      }
      setMap(map: MapView | null) {
        this.element.remove();
        map?.element.prepend(this.element);
      }
    }
    class InfoWindow {
      readonly element = document.createElement('div');
      constructor(options: { content: HTMLElement }) { this.setContent(options.content); }
      setContent(content: HTMLElement) { this.element.replaceChildren(content); }
      open(map: MapView) { map.element.append(this.element); }
      close() { this.element.remove(); }
    }
    window.__hotspotMock = {
      maps: [], reportMarkers: [], initialReportMarkers: [],
      installSdk() {
        const maps = {
          LatLng, LatLngBounds: Bounds, Map: MapView, Marker, Circle, InfoWindow,
          Point: class { constructor(readonly x: number, readonly y: number) {} },
          Event: { addListener: () => ({}), removeListener: () => {} },
          Service: {
            Status: { OK: 200 }, OrderType: { ROAD_ADDR: 'roadaddr', ADDR: 'addr' },
            reverseGeocode: () => {},
          },
        };
        (window as Window & { naver?: { maps: typeof maps } }).naver = { maps };
      },
    };
  });
  return sdkRequests;
}

test('dashboard renders red and yellow hotspots and toggles them without resetting the report map', async ({ page }) => {
  const sdkRequests = await mockNaverSdk(page);
  const unexpectedApis: string[] = [];
  const apiRequests: string[] = [];
  await page.route('**/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.fallback();
    unexpectedApis.push(path);
    return route.abort();
  });
  await page.route('**/api/admin/auth/me', route => route.fulfill({ json: { data: {
    admin: { id: 'admin-test', email: 'admin@example.invalid', name: 'Test admin', role: 'PLATFORM_ADMIN', tenantId: null },
    mode: 'database',
  } } }));
  await page.route('**/api/admin/dashboard', route => route.fulfill({ json: { data: {
    mode: 'database',
    summary: { today: 8, total: 8, received: 8, processing: 0, completed: 0, rejected: 0 },
    recentReports: [],
  } } }));
  await page.route('**/api/admin/reports/map**', route => {
    apiRequests.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: { data: {
      mode: 'database', items: reports, total: reports.length, page: 1, pageSize: 200,
    } } });
  });
  await page.route('**/api/admin/reports/hotspots**', route => {
    apiRequests.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: { data: {
      mode: 'database', totalReports: reports.length,
      zones: [
        { latitude: 37.56656, longitude: 126.97806, count: 5, level: 'red', radiusMeters: 150 },
        { latitude: 37.58653, longitude: 126.99803, count: 3, level: 'yellow', radiusMeters: 150 },
      ],
    } } });
  });

  await page.goto('/admin/dashboard');
  const map = page.getByRole('region', { name: '신고 위치 지도' });
  const toggle = page.getByRole('switch', { name: '신고 집중 구역 표시' });
  await expect(map).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-test-map-circle]')).toHaveCount(2);
  await expect(page.locator('.admin-hotspot-badge')).toHaveCount(0);
  await expect(page.locator('.admin-hotspot-panel')).toContainText('집중 구역 1곳');
  await expect(page.locator('.admin-hotspot-panel')).toContainText('관심 구역 1곳');
  await expect(map.locator('.admin-map-marker')).toHaveCount(2);
  expect((await page.locator('[data-test-map-circle]').evaluateAll(elements =>
    elements.map(element => (element as HTMLElement).dataset.fillColor))).sort()).toEqual(['#e54c5d', '#e9b931'].sort());

  await page.evaluate(() => { window.__hotspotMock.initialReportMarkers = [...window.__hotspotMock.reportMarkers]; });
  const mapState = () => page.evaluate(() => ({
    constructed: window.__hotspotMock.maps.length,
    destroyed: window.__hotspotMock.maps.some(map => map.destroyed),
    reportMarkersCreated: window.__hotspotMock.reportMarkers.length,
    reportMarkersPreserved: window.__hotspotMock.initialReportMarkers.every((element, index) =>
      window.__hotspotMock.reportMarkers[index] === element && element.isConnected),
  }));
  const initialState = await mapState();
  expect(initialState).toEqual({ constructed: 1, destroyed: false, reportMarkersCreated: 2, reportMarkersPreserved: true });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('[data-test-map-circle]')).toHaveCount(0);
  await expect(page.locator('.admin-hotspot-badge')).toHaveCount(0);
  await expect(map.locator('.admin-map-marker')).toHaveCount(2);
  expect(await mapState()).toEqual(initialState);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-test-map-circle]')).toHaveCount(2);
  await expect(page.locator('.admin-hotspot-badge')).toHaveCount(0);
  await expect(map.locator('.admin-map-marker')).toHaveCount(2);
  expect(await mapState()).toEqual(initialState);
  expect(sdkRequests).toHaveLength(1);
  expect(apiRequests).toContain('/api/admin/reports/map');
  expect(apiRequests).toContain('/api/admin/reports/hotspots');
  expect(unexpectedApis).toEqual([]);
});
