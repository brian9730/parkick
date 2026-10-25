import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '../../backend/src/generated/prisma/client';
import { hashPassword } from '../../backend/src/services/admin/password';
import { assertTaskLocalDatabase, localTestDatabaseUrl } from '../../backend/scripts/local-database';

assertTaskLocalDatabase(localTestDatabaseUrl, true);
assert.equal(new URL(localTestDatabaseUrl).pathname, '/parkick_test');
const db = new PrismaClient({ datasourceUrl: localTestDatabaseUrl, log: [] });
const runId = randomUUID();
const adminId = randomUUID();
const marker = `ADMIN_MAP:${runId}`;
const unsafeText = '<img src=x onerror="window.__adminMapXss=1">';
const email = process.env.PARKICK_ADMIN_MAP_E2E_EMAIL!;
const password = process.env.PARKICK_ADMIN_MAP_E2E_PASSWORD!;
const publicId = () => `PK-20261016-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const rows = [
  { id: randomUUID(), submissionId: randomUUID(), publicId: publicId(), latitude: 37.5665, longitude: 126.978, status: 'RECEIVED' as const },
  { id: randomUUID(), submissionId: randomUUID(), publicId: publicId(), latitude: 37.5665, longitude: 126.978, status: 'PROCESSING' as const },
  { id: randomUUID(), submissionId: randomUUID(), publicId: publicId(), latitude: 37.5723, longitude: 126.982, status: 'RECEIVED' as const },
  // Close enough to overlap at the initial zoom, but distinct after cluster expansion.
  { id: randomUUID(), submissionId: randomUUID(), publicId: publicId(), latitude: 37.56658, longitude: 126.97808, status: 'RECEIVED' as const },
  // Distinct persisted coordinates that still overlap at the SDK's maximum zoom.
  { id: randomUUID(), submissionId: randomUUID(), publicId: publicId(), latitude: 37.572301, longitude: 126.982001, status: 'RECEIVED' as const },
];

test.beforeAll(async () => {
  const region = await db.region.findUniqueOrThrow({ where: { code: 'local-development' } });
  await db.$transaction(async tx => {
    await tx.admin.create({ data: { id: adminId, email, passwordHash: await hashPassword(password), name: '지도 브라우저 검증', role: 'PLATFORM_ADMIN', tenantId: null } });
    for (const row of rows) {
      await tx.report.create({ data: {
        ...row, submissionHash: '0'.repeat(64), tenantId: region.tenantId, regionId: region.id,
        operatorName: '합성 지도 업체', deviceId: marker, address: unsafeText,
        userDescription: marker, finalReportText: `${marker} ${unsafeText}`,
        statusHistory: { create: [
          { previousStatus: null, newStatus: 'RECEIVED' },
          ...(row.status === 'PROCESSING' ? [{ previousStatus: 'RECEIVED' as const, newStatus: 'PROCESSING' as const, adminId }] : []),
        ] },
      } });
    }
  });
});

test.afterAll(async () => {
  try {
    // No reset/truncate or photo files: only this run's exact UUIDs and marker are removed.
    const where = { id: { in: rows.map(row => row.id) }, submissionId: { in: rows.map(row => row.submissionId) }, userDescription: marker };
    assert.equal(await db.reportImage.count({ where: { report: where } }), 0);
    await db.report.deleteMany({ where });
    assert.equal(await db.report.count({ where }), 0);
    await db.admin.deleteMany({ where: { id: adminId, email } });
    assert.equal(await db.adminSession.count({ where: { adminId } }), 0);
  } finally { await db.$disconnect(); }
});

interface MockPosition { lat(): number; lng(): number }
interface MockMarkerState { position: MockPosition; attached: boolean }
interface AdminMapControls {
  markers: MockMarkerState[]; reverseGeocodeCalls: number; destroyedMaps: number; removedListeners: number; activeListeners: number;
  getZoom(): number;
  setZoom(zoom: number): void;
  emitIdle(): void;
  installSdk(): void;
}
declare global { interface Window { __adminMapFixture: AdminMapControls; __adminMapXss?: number } }

async function prepareSdk(page: Page) {
  const sdkRequests: string[] = [];
  // Only the NAVER SDK is substituted. Local login, dashboard and report APIs remain real.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
    return route.fallback();
  });
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js**', route => {
    const url = new URL(route.request().url());
    sdkRequests.push(url.toString());
    expect(url.searchParams.get('ncpKeyId')).toBe('parkick-map-sdk-test-only');
    const callback = url.searchParams.get('callback');
    assert.ok(callback && /^[\w$]+$/.test(callback));
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: `window.__adminMapFixture.installSdk(); window[${JSON.stringify(callback)}]();` });
  });
  await page.addInitScript(() => {
    const liveMaps: MapView[] = [];
    const controls: AdminMapControls = {
      markers: [], reverseGeocodeCalls: 0, destroyedMaps: 0, removedListeners: 0, activeListeners: 0, installSdk,
      getZoom: () => liveMaps.at(-1)!.getZoom(),
      setZoom: zoom => liveMaps.at(-1)!.setZoom(zoom),
      emitIdle: () => liveMaps.at(-1)!.emit('idle'),
    };
    window.__adminMapFixture = controls;
    class LatLng {
      constructor(private latitude: number, private longitude: number) {}
      lat() { return this.latitude; }
      lng() { return this.longitude; }
    }
    class SdkEvents {
      readonly listeners = new Map<string, Set<() => void>>();
      emit(event: string) { for (const listener of this.listeners.get(event) ?? []) listener(); }
    }
    function project(position: MockPosition, zoom: number) {
      const scale = 256 * 2 ** zoom;
      const sine = Math.sin(position.lat() * Math.PI / 180);
      return { x: (position.lng() + 180) / 360 * scale, y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale };
    }
    class Bounds {
      constructor(readonly southwest: MockPosition, readonly northeast: MockPosition) {}
      getCenter() { return new LatLng((this.southwest.lat() + this.northeast.lat()) / 2, (this.southwest.lng() + this.northeast.lng()) / 2); }
    }
    class MapView extends SdkEvents {
      private center: MockPosition;
      private zoom: number;
      private destroyed = false;
      constructor(readonly element: HTMLElement, options: { center: MockPosition; zoom: number }) {
        super(); this.center = options.center; this.zoom = options.zoom;
        element.dataset.testMap = 'naver-sdk-double'; liveMaps.push(this);
      }
      private notify(events: string[]) {
        window.setTimeout(() => { if (!this.destroyed) for (const event of events) this.emit(event); }, 0);
      }
      getZoom() { return this.zoom; }
      getMaxZoom() { return 22; }
      getProjection() {
        return { fromCoordToOffset: (position: MockPosition) => {
          const point = project(position, this.zoom);
          const center = project(this.center, this.zoom);
          return { x: point.x - center.x + this.element.clientWidth / 2, y: point.y - center.y + this.element.clientHeight / 2 };
        } };
      }
      setCenter(position: MockPosition) { this.center = position; this.notify(['idle']); }
      setZoom(zoom: number) { this.zoom = Math.max(3, Math.min(this.getMaxZoom(), zoom)); this.notify(['zoom_changed', 'idle']); }
      fitBounds(bounds: Bounds, options: { top?: number; right?: number; bottom?: number; left?: number; maxZoom?: number } = {}) {
        const southwest = project(bounds.southwest, 0); const northeast = project(bounds.northeast, 0);
        const width = Math.max(1, this.element.clientWidth - (options.left ?? 0) - (options.right ?? 0));
        const height = Math.max(1, this.element.clientHeight - (options.top ?? 0) - (options.bottom ?? 0));
        const zoom = Math.floor(Math.log2(Math.min(width / Math.abs(northeast.x - southwest.x), height / Math.abs(northeast.y - southwest.y))));
        this.center = bounds.getCenter();
        this.setZoom(Math.min(options.maxZoom ?? this.getMaxZoom(), zoom));
      }
      autoResize() { this.notify(['size_changed', 'idle']); }
      destroy() {
        this.destroyed = true; controls.destroyedMaps += 1; this.element.replaceChildren();
        liveMaps.splice(liveMaps.indexOf(this), 1);
      }
    }
    class Marker extends SdkEvents implements MockMarkerState {
      position: MockPosition;
      attached = false;
      readonly element = document.createElement('div');
      constructor(options: { position: MockPosition; map: MapView; icon?: { content?: HTMLElement | string } }) {
        super();
        this.position = options.position;
        this.element.dataset.testMapMarker = `${this.position.lat()},${this.position.lng()}`;
        if (typeof options.icon?.content === 'string') this.element.innerHTML = options.icon.content;
        else if (options.icon?.content) this.element.append(options.icon.content);
        this.element.addEventListener('click', () => this.emit('click'));
        this.setMap(options.map);
        controls.markers.push(this);
      }
      getPosition() { return this.position; }
      setMap(map: MapView | null) { this.attached = map !== null; if (map) map.element.append(this.element); else this.element.remove(); }
    }
    class InfoWindow {
      readonly element = document.createElement('div');
      constructor(options: { content: HTMLElement | string }) { this.setContent(options.content); }
      setContent(content: HTMLElement | string) {
        this.element.replaceChildren();
        if (typeof content === 'string') this.element.innerHTML = content;
        else this.element.append(content);
      }
      open(map: MapView) { map.element.append(this.element); }
      close() { this.element.remove(); }
    }
    function installSdk() {
      const maps = {
        LatLng, Map: MapView, Marker, InfoWindow,
        Point: class { constructor(readonly x: number, readonly y: number) {} },
        LatLngBounds: Bounds,
        Event: {
          addListener: (target: SdkEvents, event: string, callback: () => void) => {
            const callbacks = target.listeners.get(event) ?? new Set<() => void>();
            callbacks.add(callback); target.listeners.set(event, callbacks); controls.activeListeners += 1;
            return { target, event, callback };
          },
          removeListener: (listener: { target: SdkEvents; event: string; callback: () => void }) => {
            if (listener.target.listeners.get(listener.event)?.delete(listener.callback)) controls.activeListeners -= 1;
            controls.removedListeners += 1;
          },
        },
        Service: {
          Status: { OK: 200, ERROR: 500 }, OrderType: { ROAD_ADDR: 'roadaddr', ADDR: 'addr' },
          reverseGeocode: () => { controls.reverseGeocodeCalls += 1; },
        },
      };
      (window as unknown as { naver: { maps: typeof maps } }).naver = { maps };
    }
  });
  return sdkRequests;
}

async function loginAndSearch(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '관리자 로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await page.goto('/admin/map');
  await expect(page.getByRole('heading', { name: '신고 지도', exact: true })).toBeVisible();
  await page.getByLabel('지도 신고 검색', { exact: true }).fill(marker);
  const response = page.waitForResponse(reply => reply.url().includes('/api/admin/reports/map?') && new URL(reply.url()).searchParams.get('q') === marker);
  await page.getByRole('button', { name: '검색', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('[data-test-map-marker]')).toHaveCount(2);
}

test('nearby report counts expand into distinct markers and exact duplicates keep safe report details', async ({ page, request }, testInfo) => {
  const sdkRequests = await prepareSdk(page);
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await request.get('/api/admin/reports/map')).status()).toBe(401);
  await loginAndSearch(page);
  expect(sdkRequests.length).toBeGreaterThan(0);
  const result = await page.request.get(`/api/admin/reports/map?q=${encodeURIComponent(marker)}`);
  expect(result.status()).toBe(200);
  expect(result.headers()['cache-control']).toContain('no-store');
  const items = (await result.json()).data.items as { publicId: string; latitude: number; longitude: number }[];
  expect(items).toHaveLength(rows.length);
  for (const row of rows) expect(items).toContainEqual(expect.objectContaining({ publicId: row.publicId, latitude: row.latitude, longitude: row.longitude }));

  const nearby = page.getByRole('button', { name: '주변 신고 3건 확대하기', exact: true });
  await expect(nearby).toHaveText('3');
  await expect(nearby).toHaveClass(/admin-map-marker-mixed/);
  await expect(page.getByRole('button', { name: '주변 신고 2건 확대하기', exact: true })).toHaveClass(/admin-map-marker-received/);
  const initialZoom = await page.evaluate(() => window.__adminMapFixture.getZoom());
  await nearby.focus();
  await nearby.press('Enter');
  await expect(page.locator('[data-test-map-marker]')).toHaveCount(3);
  expect(await page.evaluate(() => window.__adminMapFixture.getZoom())).toBeGreaterThan(initialZoom);
  await expect(page.getByRole('button', { name: `${rows[3].publicId} 신고 위치 보기`, exact: true })).toHaveText('1');
  await expect(page.getByRole('button', { name: '신고 위치 2건 보기', exact: true })).toHaveText('2');
  await page.getByRole('button', { name: '신고 위치 2건 보기', exact: true }).click();
  const info = page.locator('.admin-map-info');
  await expect(info).toBeVisible();
  await expect(info.locator('.admin-map-info-report')).toHaveCount(2);
  await expect(info).toContainText(rows[0].publicId);
  await expect(info).toContainText(rows[1].publicId);
  await expect(info).toContainText(unsafeText);
  expect(await info.locator('img').count()).toBe(0);
  expect(await page.evaluate(() => window.__adminMapXss)).toBeUndefined();
  expect(await page.evaluate(() => window.__adminMapFixture.reverseGeocodeCalls)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('grouped-reports-mobile.png'), fullPage: true });
  await info.getByRole('link', { name: `${rows[0].publicId} 신고 상세 보기`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/reports/${rows[0].publicId}$`));
  await expect(page.getByRole('heading', { name: '신고 상세', exact: true })).toBeVisible();
  await expect(page.getByText(`${marker} ${unsafeText}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__adminMapXss)).toBeUndefined();
});

test('zooming out regroups nearby reports and maximum zoom keeps every overlapping report accessible', async ({ page }) => {
  await prepareSdk(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAndSearch(page);
  const initialZoom = await page.evaluate(() => window.__adminMapFixture.getZoom());
  await page.getByRole('button', { name: '주변 신고 3건 확대하기', exact: true }).click();
  await expect(page.locator('[data-test-map-marker]')).toHaveCount(3);
  const single = page.getByRole('button', { name: `${rows[3].publicId} 신고 위치 보기`, exact: true });
  await expect(single).toHaveClass(/admin-map-marker-received/);
  await single.click();
  await expect(page.locator('.admin-map-info-report')).toHaveCount(1);
  await expect(page.locator('.admin-map-info')).toContainText(rows[3].publicId);
  await expect(page.locator('.admin-map-info').getByRole('link')).toHaveAttribute('href', `/admin/reports/${rows[3].publicId}`);
  // SDK idle also fires when an InfoWindow pans into view; it must not close the same popup.
  await page.evaluate(async () => {
    window.__adminMapFixture.emitIdle();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(page.locator('.admin-map-info')).toContainText(rows[3].publicId);

  await page.evaluate(zoom => window.__adminMapFixture.setZoom(zoom), initialZoom);
  await expect(page.locator('[data-test-map-marker]')).toHaveCount(2);
  await expect(page.locator('.admin-map-info')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '주변 신고 3건 확대하기', exact: true })).toHaveText('3');
  expect(await page.locator('.admin-map-marker').allTextContents()).toEqual(expect.arrayContaining(['3', '2']));

  // These two persisted positions differ by 0.000001 degrees; max zoom cannot separate them visually.
  await page.getByRole('button', { name: '주변 신고 2건 확대하기', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__adminMapFixture.getZoom())).toBe(22);
  await expect(page.locator('[data-test-map-marker]')).toHaveCount(3);
  const inseparable = page.locator('.admin-map-marker-received').filter({ hasText: /^2$/ });
  await expect(inseparable).toHaveAccessibleName('신고 위치 2건 보기');
  await inseparable.click();
  const info = page.locator('.admin-map-info');
  await expect(info.locator('.admin-map-info-report')).toHaveCount(2);
  for (const row of [rows[2], rows[4]]) {
    await expect(info).toContainText(row.publicId);
    await expect(info.getByRole('link', { name: `${row.publicId} 신고 상세 보기`, exact: true })).toHaveAttribute('href', `/admin/reports/${row.publicId}`);
  }
  await expect(info).not.toContainText(rows[0].publicId);
  await page.getByRole('button', { name: '신고 정보 닫기', exact: true }).click();
  await expect(inseparable).toBeFocused();
  expect(await page.evaluate(() => window.__adminMapFixture.reverseGeocodeCalls)).toBe(0);
  expect(await page.locator('.admin-map-marker').allTextContents()).toEqual(expect.arrayContaining(['2', '2', '1']));
});

test('status and search filters update real map results without address lookups', async ({ page }) => {
  await prepareSdk(page);
  await loginAndSearch(page);
  await page.getByLabel('처리 상태', { exact: true }).selectOption('PROCESSING');
  await expect(page.locator('[data-test-map-marker]')).toHaveCount(1);
  await expect(page.locator('.admin-map-marker')).toHaveClass(/admin-map-marker-processing/);
  await page.locator('[data-test-map-marker]').getByRole('button').click();
  await expect(page.locator('.admin-map-info')).toContainText(rows[1].publicId);
  await expect(page.locator('.admin-map-info')).not.toContainText(rows[0].publicId);
  await expect(page.locator('.admin-map-info')).toContainText('처리중');

  await page.getByLabel('처리 상태', { exact: true }).selectOption('');
  await page.getByLabel('지도 신고 검색', { exact: true }).fill(rows[2].publicId);
  const response = page.waitForResponse(reply => reply.url().includes('/api/admin/reports/map?') && new URL(reply.url()).searchParams.get('q') === rows[2].publicId);
  await page.getByRole('button', { name: '검색', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('[data-test-map-marker]')).toHaveCount(1);
  await page.locator('[data-test-map-marker="37.5723,126.982"]').getByRole('button').click();
  await expect(page.locator('.admin-map-info')).toContainText(rows[2].publicId);
  await expect(page.locator('.admin-map-info')).not.toContainText(rows[1].publicId);
  expect(await page.evaluate(() => window.__adminMapFixture.reverseGeocodeCalls)).toBe(0);
  await page.getByRole('button', { name: '신고 정보 닫기', exact: true }).click();
  await expect(page.locator('.admin-map-info')).toHaveCount(0);
  await page.getByRole('navigation', { name: '관리자 메뉴' }).getByRole('link', { name: '신고 관리', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  expect(await page.evaluate(() => window.__adminMapFixture.markers.every(marker => !marker.attached))).toBe(true);
  expect(await page.evaluate(() => window.__adminMapFixture.destroyedMaps)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__adminMapFixture.removedListeners)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__adminMapFixture.activeListeners)).toBe(0);
});
