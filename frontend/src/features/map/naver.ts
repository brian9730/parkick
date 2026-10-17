// Narrow types for the public NAVER Maps JavaScript SDK used by this feature.
// https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html
// https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Service.html
export interface NaverLatLng { lat(): number; lng(): number }
export interface NaverMap {
  setCenter(position: NaverLatLng): void;
  setZoom?(zoom: number): void;
  getZoom?(): number;
  getMaxZoom?(): number;
  getProjection?(): { fromCoordToOffset(position: NaverLatLng): NaverPoint };
  fitBounds?(bounds: NaverLatLngBounds, options?: { top: number; right: number; bottom: number; left: number; maxZoom: number }): void;
  autoResize(): void;
  destroy(): void;
}
export interface NaverLatLngBounds { getCenter(): NaverLatLng }
export interface NaverPoint { x: number; y: number }
export interface NaverInfoWindow {
  setContent(content: HTMLElement): void;
  open(map: NaverMap, position: NaverLatLng): void;
  close(): void;
}
export interface NaverMarker {
  getPosition(): NaverLatLng;
  setPosition(position: NaverLatLng): void;
  setMap(map: NaverMap | null): void;
}
export type NaverMapEventListener = object;
export interface NaverReverseGeocodeResponse {
  v2?: {
    status?: { code: number | string };
    address?: { roadAddress?: string; jibunAddress?: string };
  };
}
export interface NaverMaps {
  LatLng: new (latitude: number, longitude: number) => NaverLatLng;
  Map: new (container: HTMLElement, options: { center: NaverLatLng; zoom: number; keyboardShortcuts?: boolean }) => NaverMap;
  Marker: new (options: { map: NaverMap; position: NaverLatLng; draggable: boolean; title: string; icon?: { content: HTMLElement; anchor: NaverPoint; size: { width: number; height: number } } }) => NaverMarker;
  Point?: new (x: number, y: number) => NaverPoint;
  LatLngBounds?: new (southWest: NaverLatLng, northEast: NaverLatLng) => NaverLatLngBounds;
  InfoWindow?: new (options: { content: HTMLElement; maxWidth: number; borderWidth: number; backgroundColor: string; disableAnchor: boolean }) => NaverInfoWindow;
  Event: {
    addListener(target: NaverMarker, event: 'dragend' | 'click', callback: () => void): NaverMapEventListener;
    addListener(target: NaverMap, event: 'idle' | 'zoom_changed' | 'size_changed', callback: () => void): NaverMapEventListener;
    removeListener(listener: NaverMapEventListener): void;
  };
  Service: {
    Status: { OK: number };
    OrderType: { ROAD_ADDR: string; ADDR: string };
    reverseGeocode(options: { coords: NaverLatLng; orders: string }, callback: (status: number, response?: NaverReverseGeocodeResponse) => void): void;
  };
}

type NaverWindow = Window & {
  naver?: { maps?: NaverMaps };
  navermap_authFailure?: () => void;
  [callback: `__parkickNaverMapsReady_${number}`]: (() => void) | undefined;
};

const AUTH_ERROR = '지도 서비스 인증을 확인하지 못했어요. 위도·경도를 직접 입력하거나 잠시 후 다시 시도해 주세요.';
const authListeners = new Set<() => void>();
let pending: Promise<NaverMaps> | null = null;
let needsReload = false;
let callbackSequence = 0;
let installedAuthHandler: (() => void) | undefined;
let originalAuthHandler: (() => void) | undefined;

export class NaverMapsLoadError extends Error {}

function getReadyMaps(): NaverMaps | undefined {
  const maps = (window as unknown as NaverWindow).naver?.maps;
  return typeof maps?.Map === 'function' && typeof maps.LatLng === 'function'
    && typeof maps.Marker === 'function' && typeof maps.Event?.addListener === 'function'
    && typeof maps.Event.removeListener === 'function' && typeof maps.Service?.reverseGeocode === 'function'
    && typeof maps.Service.Status?.OK === 'number' && typeof maps.Service.OrderType?.ROAD_ADDR === 'string'
    && typeof maps.Service.OrderType.ADDR === 'string' ? maps : undefined;
}

/** Also catches authentication failures reported after the SDK ready callback. */
export function subscribeNaverAuthFailure(listener: () => void): () => void {
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
}

export function loadNaverMaps(clientId: string): Promise<NaverMaps> {
  if (!clientId.trim()) return Promise.reject(new NaverMapsLoadError('지도 서비스가 아직 연결되지 않았어요.'));
  if (pending) return pending;
  pending = new Promise<NaverMaps>((resolve, reject) => {
    const globals = window as unknown as NaverWindow;
    const script = document.createElement('script');
    const callbackName = `__parkickNaverMapsReady_${++callbackSequence}` as const;
    let settled = false;
    if (globals.navermap_authFailure !== installedAuthHandler) originalAuthHandler = globals.navermap_authFailure;
    const failAuthentication = () => {
      needsReload = true;
      pending = null;
      finish(new NaverMapsLoadError(AUTH_ERROR));
      // A ready SDK can fail authentication later; mounted maps then disappear.
      for (const listener of authListeners) listener();
      originalAuthHandler?.();
    };
    const finish = (error?: NaverMapsLoadError) => {
      if (settled) return;
      const maps = getReadyMaps();
      if (!error && !maps) return;
      settled = true;
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (error) {
        // Removing a timed-out script does not guarantee that its response stops.
        // Keep a self-removing no-op so a late callback cannot throw or resolve
        // a newer attempt. A failed network load removes this guard below.
        globals[callbackName] = () => { delete globals[callbackName]; };
        needsReload = true;
        script.remove();
        if (globals.navermap_authFailure === failAuthentication) {
          globals.navermap_authFailure = originalAuthHandler;
          installedAuthHandler = undefined;
        }
        reject(error);
      } else if (maps) {
        delete globals[callbackName];
        needsReload = false;
        resolve(maps);
      }
    };
    const timeout = window.setTimeout(() => finish(new NaverMapsLoadError('지도 연결 시간이 초과되었어요. 잠시 후 다시 시도하거나 위도·경도를 직접 입력해 주세요.')), 12_000);
    installedAuthHandler = failAuthentication;
    globals.navermap_authFailure = failAuthentication;
    globals[callbackName] = () => finish();
    if (!needsReload && getReadyMaps()) { finish(); return; }
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder&callback=${callbackName}`;
    script.onload = () => finish();
    script.onerror = () => {
      finish(new NaverMapsLoadError('지도를 불러오지 못했어요. 연결을 확인한 후 다시 시도하거나 위도·경도를 직접 입력해 주세요.'));
      delete globals[callbackName];
    };
    document.head.appendChild(script);
  }).catch(error => { pending = null; throw error; });
  return pending;
}

export function getNaverAddress(response?: NaverReverseGeocodeResponse): string | null {
  const result = response?.v2;
  if (result?.status && Number(result.status.code) !== 0) return null;
  const road = result?.address?.roadAddress;
  const jibun = result?.address?.jibunAddress;
  const address = (typeof road === 'string' ? road.trim() : '') || (typeof jibun === 'string' ? jibun.trim() : '');
  return address || null;
}

export function naverAuthErrorMessage(): string { return AUTH_ERROR; }
