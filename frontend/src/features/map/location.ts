export type LocationSource = 'gps' | 'manual' | 'map';

/** Client-reported evidence only. Never use these fields to authorize a tenant. */
export interface ReportLocation {
  latitude: number;
  longitude: number;
  source: LocationSource;
  accuracy?: number;
  capturedAt?: string;
  address: string;
  addressSource: 'manual' | 'naver' | null;
}

export function isValidCoordinates(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export function parseCoordinates(latitude: string, longitude: string): Pick<ReportLocation, 'latitude' | 'longitude'> | null {
  // Number('') is zero, so require a nonempty decimal representation first.
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const lat = latitude.trim();
  const lng = longitude.trim();
  if (!decimal.test(lat) || !decimal.test(lng)) return null;
  const latitudeNumber = Number(lat);
  const longitudeNumber = Number(lng);
  return isValidCoordinates(latitudeNumber, longitudeNumber)
    ? { latitude: latitudeNumber, longitude: longitudeNumber }
    : null;
}

export function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1: return '위치 권한이 거부되었어요. 브라우저 설정에서 위치를 허용한 후 다시 시도하거나 위도·경도를 직접 입력해 주세요.';
    case 2: return '현재 위치를 확인하지 못했어요. 신호가 잘 잡히는 곳에서 다시 시도하거나 위도·경도를 직접 입력해 주세요.';
    case 3: return '위치 확인 시간이 초과되었어요. 다시 시도하거나 위도·경도를 직접 입력해 주세요.';
    default: return '위치를 확인할 수 없어요. 다시 시도하거나 위도·경도를 직접 입력해 주세요.';
  }
}
