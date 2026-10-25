import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';

interface GeoRequest {
  success: PositionCallback;
  failure: PositionErrorCallback | null;
}
interface AddressRequest {
  longitude: number;
  latitude: number;
  orders: string;
  callback: (status: number, response?: { v2?: { address?: { roadAddress?: string; jibunAddress?: string } } }) => void;
}
interface MockPosition { lat(): number; lng(): number }
interface MockMarker {
  position: MockPosition;
  dragEnd?: () => void;
  attached: boolean;
  setPosition(position: MockPosition): void;
}
interface MapFeatureControls {
  gps: GeoRequest[];
  addresses: AddressRequest[];
  markers: MockMarker[];
  removedListeners: number;
  destroyedMaps: number;
  installSdk(): void;
  moveMarker(latitude: number, longitude: number): void;
  succeedGps(index: number, latitude: number, longitude: number): void;
}
declare global { interface Window { __mapFeature: MapFeatureControls } }

type SdkMode = 'preloaded' | 'failure' | 'script' | 'auth-failure' | 'render-failure';

async function prepareLocationStep(page: Page, sdkMode: SdkMode = 'preloaded') {
  const sdkRequests: string[] = [];
  // SDK routes below are fulfilled locally; abort every other external request as well.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
    return route.fallback();
  });
  await page.route(/^http:\/\/localhost:5188\/api\//, route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Test-only unauthenticated session' } }) }));
  await page.route('**/api/reports/validate-photos', route => route.fulfill({ json: { data: { valid: true } } }));
  // No test request, key, or coordinates are sent to an external provider.
  await page.route('https://oapi.map.naver.com/openapi/v3/maps.js**', route => {
    const url = new URL(route.request().url());
    sdkRequests.push(url.toString());
    if (sdkMode === 'failure' || sdkMode === 'preloaded') return route.abort();
    if (sdkMode === 'auth-failure' && sdkRequests.length === 1) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.navermap_authFailure();' });
    }
    const callback = url.searchParams.get('callback');
    if (!callback || !/^[\w$]+$/.test(callback)) throw new Error('NAVER SDK requires an explicit, valid readiness callback.');
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: `window.__mapFeature.installSdk(); window[${JSON.stringify(callback)}]();` });
  });
  await page.addInitScript(({ sdkMode }) => {
    class LatLng {
      constructor(private latitude: number, private longitude: number) {}
      lat() { return this.latitude; }
      lng() { return this.longitude; }
    }
    const controls: MapFeatureControls = {
      gps: [], addresses: [], markers: [], removedListeners: 0, destroyedMaps: 0,
      installSdk,
      moveMarker(latitude, longitude) {
        const marker = this.markers[this.markers.length - 1];
        marker.setPosition(new LatLng(latitude, longitude));
        marker.dragEnd?.();
      },
      succeedGps(index, latitude, longitude) {
        this.gps[index].success({
          coords: { latitude, longitude, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) },
          timestamp: Date.now(), toJSON: () => ({}),
        });
      },
    };
    window.__mapFeature = controls;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (success: PositionCallback, failure: PositionErrorCallback | null) => controls.gps.push({ success, failure }) },
    });
    class Marker implements MockMarker {
      position: MockPosition;
      attached = true;
      dragEnd?: () => void;
      constructor(options: { position: MockPosition }) { this.position = options.position; controls.markers.push(this); }
      getPosition() { return this.position; }
      setPosition(position: MockPosition) { this.position = position; }
      setMap(map: unknown) { this.attached = map !== null; }
    }
    function installSdk() {
      const maps = {
        LatLng,
        Map: class {
          constructor() { if (sdkMode === 'render-failure') throw new Error('Test map render failure'); }
          setCenter() { /* Test SDK: no real tiles are fetched. */ }
          autoResize() { /* Test SDK: no real tiles are fetched. */ }
          destroy() { controls.destroyedMaps += 1; }
        },
        Marker,
        Event: {
          addListener: (marker: Marker, _event: string, callback: () => void) => { marker.dragEnd = callback; return { marker }; },
          removeListener: (listener: { marker: Marker }) => { listener.marker.dragEnd = undefined; controls.removedListeners += 1; },
        },
        Service: {
          Status: { OK: 200, ERROR: 500 },
          OrderType: { ROAD_ADDR: 'roadaddr', ADDR: 'addr' },
          reverseGeocode: (options: { coords: MockPosition; orders: string }, callback: AddressRequest['callback']) => {
            controls.addresses.push({ longitude: options.coords.lng(), latitude: options.coords.lat(), orders: options.orders, callback });
          },
        },
      };
      (window as Window & { naver?: { maps: typeof maps } }).naver = { maps };
    }
    if (sdkMode === 'preloaded' || sdkMode === 'render-failure') installSdk();
  }, { sdkMode });
  await page.goto('/report');
  await page.getByRole('button', { name: 'QR을 확인하기 어려우신가요?' }).click();
  await page.getByLabel('운영업체', { exact: true }).selectOption('other');
  await page.getByLabel('기타 업체명', { exact: true }).fill('지도 테스트 업체');
  await page.getByLabel('기기번호', { exact: true }).fill('MAP-TEST-1');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByLabel('갤러리 사진 선택').setInputFiles(path.resolve('tests/fixtures/unknown-qr.png'));
  await expect(page.getByAltText('첨부한 현장 사진 1')).toBeVisible();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByRole('heading', { name: '신고 위치를 확인해 주세요' })).toBeVisible();
  return sdkRequests;
}

async function expectMarkerAt(page: Page, latitude: number, longitude: number) {
  await expect.poll(() => page.evaluate(() => {
    const marker = window.__mapFeature.markers.at(-1);
    return marker ? { latitude: marker.position.lat(), longitude: marker.position.lng() } : null;
  })).toEqual({ latitude, longitude });
}

test('confirmed location fits a 390 by 844 mobile viewport without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareLocationStep(page);
  await expect.poll(() => page.evaluate(() => window.__mapFeature.gps.length)).toBe(1);
  await page.evaluate(() => window.__mapFeature.succeedGps(0, 37.5665, 126.978));
  await expect.poll(() => page.evaluate(() => window.__mapFeature.addresses.length)).toBe(1);
  await page.evaluate(() => window.__mapFeature.addresses[0].callback(200, { v2: { address: { roadAddress: '서울특별시 중구 세종대로 110' } } }));
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('서울특별시 중구 세종대로 110');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.getByRole('button', { name: '다음 단계', exact: true }).evaluate(button => button.getBoundingClientRect().bottom)).toBeLessThanOrEqual(844);
  await expect(page.locator('.location-selected')).toHaveCount(0);
  await expect(page.getByText('위도·경도 직접 입력', { exact: true })).toHaveCount(0);
});

test('permission fallback, real coordinate contract, marker drag, and stale address protection', async ({ page }) => {
  await prepareLocationStep(page);
  await expect.poll(() => page.evaluate(() => window.__mapFeature.gps.length)).toBe(1);
  await page.evaluate(() => window.__mapFeature.gps[0].failure?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }));
  await expect(page.getByRole('alert')).toContainText('위치 권한이 거부');
  await expect(page.getByLabel('위도', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '현재 위치 확인', exact: true }).click();
  await page.evaluate(() => window.__mapFeature.succeedGps(1, 37.5665, 126.978));
  await expectMarkerAt(page, 37.5665, 126.978);
  await expect(page.locator('.location-selected')).toHaveCount(0);
  await expect(page.getByText('위도·경도 직접 입력', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__mapFeature.addresses.length)).toBe(1);
  expect(await page.evaluate(() => ({ latitude: window.__mapFeature.addresses[0].latitude, longitude: window.__mapFeature.addresses[0].longitude }))).toEqual({ latitude: 37.5665, longitude: 126.978 });
  expect(await page.evaluate(() => window.__mapFeature.addresses[0].orders)).toBe('roadaddr,addr');

  await page.getByLabel('주소 또는 위치 설명 (선택)').fill('직접 확인한 건물 앞');
  await page.evaluate(() => window.__mapFeature.addresses[0].callback(200, { v2: { address: { roadAddress: '늦게 도착한 이전 주소' } } }));
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('직접 확인한 건물 앞');

  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await page.evaluate(() => window.__mapFeature.moveMarker(37.57, 126.98));
  await expectMarkerAt(page, 37.57, 126.98);
  await expect(page.getByLabel('실제 신고할 위치임을 확인했습니다.')).not.toBeChecked();
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('');
  await expect.poll(() => page.evaluate(() => window.__mapFeature.addresses.length)).toBe(2);
  await page.evaluate(() => {
    window.__mapFeature.addresses[0].callback(200, { v2: { address: { roadAddress: '이전 좌표 주소' } } });
    window.__mapFeature.addresses[1].callback(200, { v2: { address: { roadAddress: '현재 좌표의 테스트 주소', jibunAddress: '우선순위가 낮은 지번 주소' } } });
  });
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('현재 좌표의 테스트 주소');
});

test('manual edits invalidate old GPS and unmount cleans up marker listeners', async ({ page }) => {
  await prepareLocationStep(page);
  await expect.poll(() => page.evaluate(() => window.__mapFeature.gps.length)).toBe(1);
  await page.evaluate(() => window.__mapFeature.gps[0].failure?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }));
  await expect(page.getByLabel('위도', { exact: true })).toBeVisible();
  await page.getByLabel('위도', { exact: true }).fill('37.5');
  await page.getByLabel('경도', { exact: true }).fill('127.1');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await expect.poll(() => page.evaluate(() => window.__mapFeature.markers.length)).toBe(1);
  await expect(page.getByText('위도·경도 직접 입력', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '현재 위치 다시 확인', exact: true }).click();
  await page.evaluate(() => window.__mapFeature.gps[1].failure?.({ code: 2, message: 'unavailable', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }));
  await expect(page.getByLabel('위도', { exact: true })).toBeVisible();
  await page.getByLabel('위도', { exact: true }).fill('91');
  await expect(page.getByLabel('실제 신고할 위치임을 확인했습니다.')).toBeDisabled();
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await expect(page.locator('#location-coordinate-error')).toContainText('위도는 -90~90');
  await page.getByLabel('위도', { exact: true }).fill('35.1');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await page.evaluate(() => window.__mapFeature.succeedGps(1, 38.0, 128.0));
  await expectMarkerAt(page, 35.1, 127.1);
  await page.getByLabel('주소 또는 위치 설명 (선택)').fill('확인한 현장');
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await page.getByRole('button', { name: '현재 위치 다시 확인', exact: true }).click();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByRole('heading', { name: '어떤 불편이 있나요?' })).toBeVisible();
  await page.evaluate(() => window.__mapFeature.succeedGps(2, 33.0, 126.0));
  expect(await page.evaluate(() => window.__mapFeature.markers.every(marker => !marker.attached))).toBe(true);
  expect(await page.evaluate(() => window.__mapFeature.removedListeners)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__mapFeature.destroyedMaps)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expectMarkerAt(page, 35.1, 127.1);
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('확인한 현장');
});

test('SDK failure is explicit and coordinates remain usable', async ({ page }) => {
  await prepareLocationStep(page, 'failure');
  await expect(page.getByText('지도를 불러오지 못했어요', { exact: true })).toBeVisible();
  await page.getByText('위도·경도 직접 입력', { exact: true }).click();
  await page.getByLabel('위도', { exact: true }).fill('37.5');
  await page.getByLabel('경도', { exact: true }).fill('127.1');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await expect(page.getByLabel('위도', { exact: true })).toHaveValue('37.5');
  await expect(page.getByLabel('경도', { exact: true })).toHaveValue('127.1');
  await page.getByLabel('주소 또는 위치 설명 (선택)').fill('서비스 연결 없이 직접 입력한 현장');
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('서비스 연결 없이 직접 입력한 현장');
});

test('map rendering failure exposes the coordinate fallback after GPS succeeds', async ({ page }) => {
  await prepareLocationStep(page, 'render-failure');
  await expect.poll(() => page.evaluate(() => window.__mapFeature.gps.length)).toBe(1);
  await page.evaluate(() => window.__mapFeature.succeedGps(0, 37.5, 127.1));
  await expect(page.getByText('지도를 표시하지 못했어요.', { exact: false })).toBeVisible();
  await page.getByText('위도·경도 직접 입력', { exact: true }).click();
  await page.getByLabel('위도', { exact: true }).fill('37.6');
  await page.getByLabel('경도', { exact: true }).fill('127.2');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toBeEnabled();
  await expect(page.getByLabel('실제 신고할 위치임을 확인했습니다.')).toBeEnabled();
});

test('NAVER SDK callback loads geocoder and reverse geocoding handles jibun and missing responses', async ({ page }) => {
  const requests = await prepareLocationStep(page, 'script');
  await expect(page.getByText('먼저 신고 위치를 선택해 주세요', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  const sdkUrl = new URL(requests[0]);
  expect(sdkUrl.searchParams.get('ncpKeyId')).toBe('parkick-map-sdk-test-only');
  expect(sdkUrl.searchParams.get('submodules')).toBe('geocoder');
  expect(sdkUrl.searchParams.get('callback')).toMatch(/^__parkickNaverMapsReady_/);
  await expect.poll(() => page.evaluate(() => window.__mapFeature.gps.length)).toBe(1);
  await page.evaluate(() => window.__mapFeature.succeedGps(0, 37.5, 127.1));
  await expect.poll(() => page.evaluate(() => window.__mapFeature.addresses.length)).toBe(1);
  await page.evaluate(() => window.__mapFeature.addresses[0].callback(200, { v2: { address: { roadAddress: '', jibunAddress: '도로명 없이 반환된 지번 주소' } } }));
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('도로명 없이 반환된 지번 주소');
  await page.evaluate(() => window.__mapFeature.moveMarker(37.51, 127.11));
  await expect.poll(() => page.evaluate(() => window.__mapFeature.addresses.length)).toBe(2);
  // NAVER documents the error response argument as optional.
  await page.evaluate(() => window.__mapFeature.addresses[1].callback(500));
  await expect(page.getByText('이 좌표의 주소를 찾지 못했어요.', { exact: false })).toBeVisible();
  await expectMarkerAt(page, 37.51, 127.11);
  await page.getByLabel('주소 또는 위치 설명 (선택)').fill('주소 조회 실패 후 직접 확인한 위치');
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('주소 조회 실패 후 직접 확인한 위치');
});

test('NAVER authentication failure can retry SDK loading without losing manual coordinates', async ({ page }) => {
  const requests = await prepareLocationStep(page, 'auth-failure');
  await expect(page.getByText('지도를 불러오지 못했어요', { exact: true })).toBeVisible();
  const failedCallback = new URL(requests[0]).searchParams.get('callback') || '';
  expect(await page.evaluate(name => typeof (window as unknown as Record<string, unknown>)[name], failedCallback)).toBe('function');
  await page.getByText('위도·경도 직접 입력', { exact: true }).click();
  await page.getByLabel('위도', { exact: true }).fill('37.5');
  await page.getByLabel('경도', { exact: true }).fill('127.1');
  await page.getByRole('button', { name: '입력한 좌표 적용' }).click();
  await page.getByRole('button', { name: '지도 다시 연결', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__mapFeature.markers.length)).toBe(1);
  expect(requests).toHaveLength(2);
  // A removed script can still finish late. Its callback must leave the newer successful attempt intact.
  expect(await page.evaluate(name => {
    const globals = window as unknown as Record<string, unknown>;
    const callback = globals[name];
    if (typeof callback !== 'function') throw new Error('Missing late-callback guard');
    callback();
    return { removed: globals[name] === undefined, markers: window.__mapFeature.markers.length };
  }, failedCallback)).toEqual({ removed: true, markers: 1 });
  await expectMarkerAt(page, 37.5, 127.1);
  await expect(page.getByText('위도·경도 직접 입력', { exact: true })).toHaveCount(0);
  await expect(page.getByText('지도를 불러오지 못했어요', { exact: true })).not.toBeVisible();
});

test('returning to a confirmed location keeps its automatic address without another lookup', async ({ page }) => {
  await prepareLocationStep(page);
  await page.clock.install({ time: new Date('2026-10-16T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-16T00:00:01Z'));
  await expect.poll(() => page.evaluate(() => window.__mapFeature.gps.length)).toBe(1);
  await page.evaluate(() => window.__mapFeature.succeedGps(0, 37.5665, 126.978));
  await expect(page.getByText('선택한 좌표의 주소를 확인하고 있어요.', { exact: true })).toBeVisible();
  await page.clock.runFor(300);
  expect(await page.evaluate(() => window.__mapFeature.addresses.length)).toBe(1);
  await page.evaluate(() => window.__mapFeature.addresses[0].callback(200, { v2: { address: { roadAddress: '서울특별시 중구 세종대로 110' } } }));
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('서울특별시 중구 세종대로 110');
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await expect(page.getByRole('heading', { name: '어떤 불편이 있나요?' })).toBeVisible();
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await expect(page.getByText('위도·경도 직접 입력', { exact: true })).toHaveCount(0);
  // Let a full lookup deadline elapse: revisiting must neither refetch nor
  // silently reset a confirmation that still refers to the same coordinates.
  await page.clock.runFor(8_500);
  expect(await page.evaluate(() => window.__mapFeature.addresses.length)).toBe(1);
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('서울특별시 중구 세종대로 110');
  await expect(page.getByLabel('실제 신고할 위치임을 확인했습니다.')).toBeChecked();
});

test('address lookup timeout and errors can retry without changing coordinates or accepting late responses', async ({ page }) => {
  await prepareLocationStep(page);
  await page.clock.install({ time: new Date('2026-10-16T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-16T00:00:01Z'));
  await expect.poll(() => page.evaluate(() => window.__mapFeature.gps.length)).toBe(1);
  await page.evaluate(() => window.__mapFeature.succeedGps(0, 37.5665, 126.978));
  await expect(page.getByText('선택한 좌표의 주소를 확인하고 있어요.', { exact: true })).toBeVisible();
  await page.clock.runFor(300);
  expect(await page.evaluate(() => window.__mapFeature.addresses.length)).toBe(1);
  await page.getByLabel('실제 신고할 위치임을 확인했습니다.').check();
  await page.clock.runFor(8_000);
  const retry = page.getByRole('button', { name: '주소 다시 조회', exact: true });
  await expect(retry).toBeVisible();
  await page.evaluate(() => window.__mapFeature.addresses[0].callback(200, { v2: { address: { roadAddress: '시간 초과 후 도착한 주소' } } }));
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('');
  await expect(retry).toBeVisible();
  // Two events in the same browser task must still produce one retry.
  await retry.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(retry).not.toBeVisible();
  await expect(page.getByLabel('실제 신고할 위치임을 확인했습니다.')).toBeChecked();
  await page.clock.runFor(300);
  expect(await page.evaluate(() => window.__mapFeature.addresses.length)).toBe(2);
  await page.evaluate(() => window.__mapFeature.addresses[1].callback(500));
  await expect(retry).toBeVisible();
  await retry.click();
  await page.clock.runFor(300);
  expect(await page.evaluate(() => window.__mapFeature.addresses.length)).toBe(3);
  expect(await page.evaluate(() => window.__mapFeature.addresses.map(({ latitude, longitude }) => ({ latitude, longitude })))).toEqual([
    { latitude: 37.5665, longitude: 126.978 },
    { latitude: 37.5665, longitude: 126.978 },
    { latitude: 37.5665, longitude: 126.978 },
  ]);
  await page.evaluate(() => {
    window.__mapFeature.addresses[1].callback(200, { v2: { address: { roadAddress: '실패한 요청의 늦은 주소' } } });
    window.__mapFeature.addresses[2].callback(200, { v2: { address: { roadAddress: '다시 조회한 현재 주소' } } });
  });
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('다시 조회한 현재 주소');
  await expectMarkerAt(page, 37.5665, 126.978);
  await expect(retry).not.toBeVisible();
  await expect(page.getByLabel('실제 신고할 위치임을 확인했습니다.')).not.toBeChecked();
});

test('rapid pin movements only look up the final coordinates and manual text cancels a queued lookup', async ({ page }) => {
  await prepareLocationStep(page);
  await page.clock.install({ time: new Date('2026-10-16T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-16T00:00:01Z'));
  await expect.poll(() => page.evaluate(() => window.__mapFeature.gps.length)).toBe(1);
  await page.evaluate(() => window.__mapFeature.succeedGps(0, 37.5665, 126.978));
  await expect.poll(() => page.evaluate(() => window.__mapFeature.markers.length)).toBe(1);
  await page.clock.runFor(150);
  await page.evaluate(() => window.__mapFeature.moveMarker(37.57, 126.98));
  await expectMarkerAt(page, 37.57, 126.98);
  await page.clock.runFor(150);
  await page.evaluate(() => window.__mapFeature.moveMarker(37.58, 126.99));
  await expectMarkerAt(page, 37.58, 126.99);
  await page.clock.runFor(299);
  expect(await page.evaluate(() => window.__mapFeature.addresses.length)).toBe(0);
  await page.clock.runFor(1);
  expect(await page.evaluate(() => window.__mapFeature.addresses.map(({ latitude, longitude }) => ({ latitude, longitude })))).toEqual([{ latitude: 37.58, longitude: 126.99 }]);
  await page.evaluate(() => window.__mapFeature.addresses[0].callback(200, { v2: { address: { roadAddress: '마지막 핀 위치의 주소' } } }));
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('마지막 핀 위치의 주소');

  await page.evaluate(() => window.__mapFeature.moveMarker(37.59, 127.0));
  await expectMarkerAt(page, 37.59, 127.0);
  await page.getByLabel('주소 또는 위치 설명 (선택)').fill('직접 확인한 출입구 앞');
  await page.clock.runFor(8_500);
  expect(await page.evaluate(() => window.__mapFeature.addresses.length)).toBe(1);
  await expect(page.getByLabel('주소 또는 위치 설명 (선택)')).toHaveValue('직접 확인한 출입구 앞');
  await expect(page.getByRole('button', { name: '주소 다시 조회', exact: true })).not.toBeVisible();
});
