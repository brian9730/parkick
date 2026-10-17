import { LocateFixed, MapPin, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, FormField } from '../../components/ui';
import { NaverLocationMap } from './NaverLocationMap';
import { getNaverAddress, loadNaverMaps, naverAuthErrorMessage, NaverMapsLoadError, subscribeNaverAuthFailure } from './naver';
import type { NaverMaps } from './naver';
import { geolocationErrorMessage, isValidCoordinates, parseCoordinates } from './location';
import type { ReportLocation } from './location';
import './LocationStep.css';

type AddressLookup = 'idle' | 'loading' | 'found' | 'unavailable' | 'manual';

export function LocationStep({ value, onChange }: {
  value: ReportLocation | null;
  onChange: (value: ReportLocation | null) => void;
}) {
  const clientId = (import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined)?.trim() || '';
  const [maps, setMaps] = useState<NaverMaps | null>(null);
  const [mapError, setMapError] = useState('');
  const [mapAttempt, setMapAttempt] = useState(0);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [latitudeText, setLatitudeText] = useState(value ? String(value.latitude) : '');
  const [longitudeText, setLongitudeText] = useState(value ? String(value.longitude) : '');
  const [coordinateError, setCoordinateError] = useState('');
  const [coordinateRevision, setCoordinateRevision] = useState(0);
  const [addressLookup, setAddressLookup] = useState<AddressLookup>(value?.addressSource === 'manual' ? 'manual' : value?.addressSource === 'naver' && value.address.trim() ? 'found' : 'idle');
  const latestValue = useRef(value);
  const latestOnChange = useRef(onChange);
  const gpsRequest = useRef(0);
  const addressRequest = useRef(0);
  const addressRetryPending = useRef(false);
  const gpsTimeout = useRef<number | null>(null);
  const latitude = value?.latitude;
  const longitude = value?.longitude;
  useEffect(() => { latestValue.current = value; latestOnChange.current = onChange; }, [value, onChange]);

  useEffect(() => () => {
    gpsRequest.current += 1;
    addressRequest.current += 1;
    if (gpsTimeout.current !== null) window.clearTimeout(gpsTimeout.current);
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    let authenticationFailed = false;
    const unsubscribe = subscribeNaverAuthFailure(() => {
      if (!active) return;
      authenticationFailed = true;
      addressRequest.current += 1;
      setMaps(null);
      setMapError(naverAuthErrorMessage());
      setAddressLookup('unavailable');
    });
    void loadNaverMaps(clientId).then(result => { if (active && !authenticationFailed) setMaps(result); }).catch(error => {
      if (active) setMapError(error instanceof NaverMapsLoadError ? error.message : '지도 서비스에 연결하지 못했어요. 잠시 후 다시 시도하거나 위도·경도를 직접 입력해 주세요.');
    });
    return () => { active = false; unsubscribe(); };
  }, [clientId, mapAttempt]);

  useEffect(() => {
    if (!maps || latitude === undefined || longitude === undefined || !isValidCoordinates(latitude, longitude)) return;
    const request = ++addressRequest.current;
    let active = true;
    let finished = false;
    let debounce: number | undefined;
    let timer: number | undefined;
    const isCurrent = () => active && !finished && request === addressRequest.current
      && latestValue.current?.latitude === latitude && latestValue.current?.longitude === longitude;
    // SDK results must never overwrite an address entered by the reporter.
    void Promise.resolve().then(() => {
      if (!isCurrent() || latestValue.current?.addressSource === 'manual') return;
      // A completed lookup belongs to these coordinates. Returning to this step
      // must not bill another request or clear the reporter's confirmation.
      if (latestValue.current?.addressSource === 'naver' && latestValue.current.address.trim()) {
        setAddressLookup('found');
        return;
      }
      setAddressLookup('loading');
      // Only the final position is looked up when the reporter moves the pin
      // repeatedly. The response deadline starts when a request is actually sent.
      debounce = window.setTimeout(() => {
        if (!isCurrent()) return;
        timer = window.setTimeout(() => {
          if (isCurrent()) {
            finished = true;
            addressRetryPending.current = false;
            setAddressLookup('unavailable');
          }
        }, 8_000);
        try {
          maps.Service.reverseGeocode({
            coords: new maps.LatLng(latitude, longitude),
            orders: `${maps.Service.OrderType.ROAD_ADDR},${maps.Service.OrderType.ADDR}`,
          }, (status, response) => {
            if (!isCurrent()) return;
            finished = true;
            addressRetryPending.current = false;
            window.clearTimeout(timer);
            const address = status === maps.Service.Status.OK ? getNaverAddress(response) : null;
            if (!address) { setAddressLookup('unavailable'); return; }
            const current = latestValue.current;
            if (!current || current.addressSource === 'manual') return;
            const updated: ReportLocation = { ...current, address, addressSource: 'naver' };
            latestValue.current = updated;
            latestOnChange.current(updated);
            setAddressLookup('found');
          });
        } catch {
          window.clearTimeout(timer);
          if (isCurrent()) {
            finished = true;
            addressRetryPending.current = false;
            setAddressLookup('unavailable');
          }
        }
      }, 300);
    });
    return () => {
      active = false;
      addressRetryPending.current = false;
      window.clearTimeout(debounce);
      window.clearTimeout(timer);
    };
  }, [maps, latitude, longitude, coordinateRevision]);

  function emit(next: ReportLocation | null) {
    latestValue.current = next;
    latestOnChange.current(next);
  }

  function cancelGps() {
    gpsRequest.current += 1;
    if (gpsTimeout.current !== null) window.clearTimeout(gpsTimeout.current);
    setGpsLoading(false);
  }

  function selectCoordinates(next: Omit<ReportLocation, 'address' | 'addressSource'>) {
    cancelGps();
    addressRequest.current += 1;
    setLatitudeText(String(next.latitude));
    setLongitudeText(String(next.longitude));
    setCoordinateError('');
    setCoordinateRevision(previous => previous + 1);
    setGpsError('');
    setAddressLookup('idle');
    emit({ ...next, address: '', addressSource: null });
  }

  function requestGps() {
    cancelGps();
    setGpsError('');
    if (!window.isSecureContext) {
      setGpsError('현재 연결에서는 위치 권한을 사용할 수 없어요. HTTPS로 접속하거나 위도·경도를 직접 입력해 주세요.');
      setManualOpen(true);
      return;
    }
    if (!navigator.geolocation) {
      setGpsError('이 브라우저는 위치 확인을 지원하지 않아요. 위도·경도를 직접 입력해 주세요.');
      setManualOpen(true);
      return;
    }
    const request = ++gpsRequest.current;
    setGpsLoading(true);
    const fail = (code: number) => {
      if (request !== gpsRequest.current) return;
      cancelGps();
      setGpsError(geolocationErrorMessage(code));
      setManualOpen(true);
    };
    // An additional deadline covers browsers that fail to invoke either callback.
    gpsTimeout.current = window.setTimeout(() => fail(3), 15_000);
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (request !== gpsRequest.current) return;
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        if (!isValidCoordinates(lat, lng)) { fail(2); return; }
        const timestamp = Number.isFinite(position.timestamp) && position.timestamp > 0 ? position.timestamp : Date.now();
        const captured = new Date(timestamp);
        selectCoordinates({
          latitude: lat, longitude: lng, source: 'gps',
          ...(Number.isFinite(accuracy) && accuracy >= 0 ? { accuracy } : {}),
          capturedAt: Number.isFinite(captured.getTime()) ? captured.toISOString() : new Date().toISOString(),
        });
      }, error => fail(error.code), { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
    } catch { fail(2); }
  }

  function editCoordinate(axis: 'latitude' | 'longitude', text: string) {
    cancelGps();
    addressRequest.current += 1;
    if (axis === 'latitude') setLatitudeText(text); else setLongitudeText(text);
    setCoordinateError('');
    setAddressLookup('idle');
    // Editing immediately invalidates the old location and its confirmation.
    emit(null);
  }

  function applyCoordinates() {
    const parsed = parseCoordinates(latitudeText, longitudeText);
    if (!parsed) {
      setCoordinateError('위도는 -90~90, 경도는 -180~180 범위의 숫자로 입력해 주세요.');
      return;
    }
    selectCoordinates({ ...parsed, source: 'manual' });
  }

  function editAddress(address: string) {
    const current = latestValue.current;
    if (!current) return;
    cancelGps();
    addressRequest.current += 1;
    setAddressLookup('manual');
    emit({ ...current, address, addressSource: 'manual' });
  }

  function retryAddress() {
    const current = latestValue.current;
    if (!maps || !current || current.addressSource === 'manual' || addressLookup !== 'unavailable' || addressRetryPending.current) return;
    addressRetryPending.current = true;
    addressRequest.current += 1;
    setAddressLookup('loading');
    setCoordinateRevision(previous => previous + 1);
  }

  return <div className="location-step">
    {maps && value ? <>
      <NaverLocationMap maps={maps} latitude={value.latitude} longitude={value.longitude} onMove={(lat, lng) => selectCoordinates({ latitude: lat, longitude: lng, source: 'map' })} />
      <p className="location-map-help">핀을 끌어 기기가 있는 위치로 옮겨 주세요. 위도·경도를 직접 입력해도 위치를 수정할 수 있어요.</p>
    </> : <div className="location-unavailable">
      <MapPin size={30} aria-hidden="true" />
      <strong>{!clientId ? '지도 서비스 미연결' : mapError ? '지도를 불러오지 못했어요' : !maps ? '지도에 연결하고 있어요' : '먼저 신고 위치를 선택해 주세요'}</strong>
      <p>{!clientId ? '현재 위치를 확인하거나 위도·경도를 직접 입력해 주세요. 지도와 주소 자동 조회는 아직 연결되지 않았어요.' : mapError || '현재 위치를 확인하거나 위도·경도를 입력하면 지도에서 핀을 움직일 수 있어요.'}</p>
      {mapError && <Button variant="secondary" onClick={() => { setMapError(''); setMapAttempt(previous => previous + 1); }}><RotateCcw size={16} />지도 다시 연결</Button>}
    </div>}
    <Button variant="secondary" className="full-width" onClick={requestGps} disabled={gpsLoading}><LocateFixed size={18} />{gpsLoading ? '현재 위치 확인 중…' : '현재 위치 확인'}</Button>
    {gpsLoading && <p className="field-hint" role="status">브라우저의 위치 권한을 허용해 주세요. 실내에서는 시간이 걸릴 수 있어요.</p>}
    {gpsError && <p className="location-error" role="alert">{gpsError}</p>}
    {value && <div className="location-selected" role="status">
      <strong>{value.source === 'gps' ? '현재 위치를 확인했어요' : value.source === 'map' ? '지도에서 위치를 수정했어요' : '직접 입력한 위치예요'}</strong>
      <span>위도 {value.latitude.toFixed(6)} · 경도 {value.longitude.toFixed(6)}</span>
      {value.source === 'gps' && value.accuracy !== undefined && <small>위치 정확도 약 {Math.round(value.accuracy)}m{value.accuracy > 100 ? ' · 오차가 커요. 실제 기기의 위치로 수정해 주세요.' : ''}</small>}
    </div>}
    <details className="location-manual" open={manualOpen} onToggle={event => setManualOpen(event.currentTarget.open)}>
      <summary>위도·경도 직접 입력</summary>
      <p className="field-hint">기기가 있는 실제 위치의 좌표를 입력한 뒤 적용해 주세요.</p>
      <div className="location-coordinate-fields">
        <FormField label="위도" htmlFor="location-latitude"><input id="location-latitude" inputMode="decimal" type="text" maxLength={24} value={latitudeText} placeholder="-90 ~ 90" onChange={event => editCoordinate('latitude', event.target.value)} aria-invalid={Boolean(coordinateError)} aria-describedby={coordinateError ? 'location-coordinate-error' : undefined} /></FormField>
        <FormField label="경도" htmlFor="location-longitude"><input id="location-longitude" inputMode="decimal" type="text" maxLength={24} value={longitudeText} placeholder="-180 ~ 180" onChange={event => editCoordinate('longitude', event.target.value)} aria-invalid={Boolean(coordinateError)} aria-describedby={coordinateError ? 'location-coordinate-error' : undefined} /></FormField>
      </div>
      <Button variant="secondary" className="full-width" onClick={applyCoordinates}>입력한 좌표 적용</Button>
      {coordinateError && <p className="location-error" id="location-coordinate-error" role="alert">{coordinateError}</p>}
    </details>
    <FormField label="주소 또는 위치 설명 (선택)" htmlFor="location-address" hint="주소를 수정해도 좌표는 바뀌지 않아요. 가까운 건물이나 도로명을 적으면 위치 확인에 도움이 돼요.">
      <input id="location-address" value={value?.address || ''} maxLength={300} disabled={!value} placeholder={value ? '주소 또는 주변 건물·도로명 입력' : '먼저 현재 위치를 확인하거나 좌표를 적용해 주세요'} onChange={event => editAddress(event.target.value)} aria-describedby="location-address-hint" />
    </FormField>
    {value && <p className={`location-address-status ${addressLookup === 'unavailable' ? 'is-error' : ''}`} role="status">
      {addressLookup === 'loading' ? '선택한 좌표의 주소를 확인하고 있어요.'
        : addressLookup === 'found' ? '선택한 좌표의 주소를 지도 서비스에서 확인했어요.'
          : addressLookup === 'unavailable' ? '이 좌표의 주소를 찾지 못했어요. 좌표는 유지되며, 주소나 위치 설명을 직접 입력할 수 있어요.'
            : addressLookup === 'manual' ? '직접 입력한 주소 또는 위치 설명이에요.'
              : !maps ? '주소 자동 조회가 연결되지 않았어요. 위치 설명을 직접 입력할 수 있어요.' : ''}
    </p>}
    {value && maps && value.addressSource !== 'manual' && addressLookup === 'unavailable' && <Button variant="secondary" className="location-address-retry" onClick={retryAddress}><RotateCcw size={16} aria-hidden="true" />주소 다시 조회</Button>}
  </div>;
}
