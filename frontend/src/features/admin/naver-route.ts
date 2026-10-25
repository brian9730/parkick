/** Naver Maps app URL Scheme. See https://guide.ncloud-docs.com/docs/application-maps-url-scheme-vpc */
export type NaverRouteMode = 'walk' | 'car';
export type NaverRoutePlatform = 'android' | 'ios' | 'other';

export interface NaverRouteOptions {
  latitude: number;
  longitude: number;
  destinationName?: string | null;
  mode: NaverRouteMode;
  appUrl: string;
  platform: NaverRoutePlatform;
}

export const NAVER_MAPS_IOS_STORE_URL = 'https://apps.apple.com/kr/app/id311867728';

export function naverRoutePlatform(userAgent: string, maxTouchPoints = 0): NaverRoutePlatform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  return 'other';
}

function validKoreanCoordinates(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= 31.43 && latitude <= 44.35
    && longitude >= 122.37 && longitude <= 132;
}

export function buildNaverRouteUrl({
  latitude, longitude, destinationName, mode, appUrl, platform,
}: NaverRouteOptions): string {
  if (!validKoreanCoordinates(latitude, longitude)) {
    throw new RangeError('Naver Maps requires valid destination coordinates in Korea.');
  }
  if (mode !== 'walk' && mode !== 'car') throw new TypeError('Unsupported Naver Maps route mode.');

  const parsedAppUrl = new URL(appUrl);
  if (parsedAppUrl.protocol !== 'http:' && parsedAppUrl.protocol !== 'https:') {
    throw new TypeError('The mobile web appname must be an HTTP(S) URL.');
  }

  // NAVER identifies mobile-web integrations by their web page URL. The map app
  // itself uses the device's live location as the starting point when s* is absent.
  const params = [
    `dlat=${latitude}`,
    `dlng=${longitude}`,
    ...(destinationName?.trim() ? [`dname=${encodeURIComponent(destinationName.trim())}`] : []),
    `appname=${encodeURIComponent(parsedAppUrl.origin + '/')}`,
  ].join('&');

  const path = `route/${mode}?${params}`;
  return platform === 'android'
    ? `intent://${path}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end`
    : `nmap://${path}`;
}
