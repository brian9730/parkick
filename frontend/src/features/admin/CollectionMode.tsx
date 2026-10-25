import { ArrowUpRight, LocateFixed, MapPin, Map as MapIcon, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import type { NearbyReport } from '../../api/admin';
import { Button, EmptyState, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { isValidCoordinates } from '../map/location';
import { AdminNaverReportMap } from './AdminNaverReportMap';
import { NaverRouteButtons } from './NaverRouteButtons';
import { useAdminData } from './useAdminData';
import './report-map.css';
import './CollectionMode.css';

const pageSize = 50;
const noReports: NearbyReport[] = [];
const collectionScrollKey = 'parkick:collection-scroll';

interface CurrentLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  checkedAt: Date;
}

interface CollectionModeProps {
  refreshKey: number;
  page: number;
  focusedPublicId: string | null;
  onPageChange: (page: number) => void;
  onFocusChange: (publicId: string) => void;
}

function locationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === 1) return '브라우저의 위치 권한이 차단되어 있습니다. 사이트의 위치 권한을 허용한 뒤 다시 확인해 주세요.';
  if (error.code === 3) return '현재 위치 확인 시간이 초과되었습니다. GPS 또는 네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
  return '현재 위치를 확인하지 못했습니다. 기기의 위치 서비스를 켜고 다시 시도해 주세요.';
}

function formatDistance(distanceMeters: number): string {
  const meters = Math.max(0, Math.round(distanceMeters));
  return meters < 1000 ? `${meters.toLocaleString('ko-KR')}m` : `${(meters / 1000).toFixed(1)}km`;
}

function movedMeters(from: CurrentLocation, to: CurrentLocation): number {
  const radians = Math.PI / 180;
  const latitudeDifference = (to.latitude - from.latitude) * radians;
  const longitudeDifference = (to.longitude - from.longitude) * radians;
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin(longitudeDifference / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function collectionReturnTo(page: number, publicId: string): string {
  const params = new URLSearchParams({ mode: 'collect', focus: publicId });
  if (page > 1) params.set('page', String(page));
  return `/admin/dashboard?${params.toString()}`;
}

function CollectionReports({ location, refreshKey, page, focusedPublicId, onPageChange, onFocusChange }: {
  location: CurrentLocation;
} & CollectionModeProps) {
  const [focusRequest, setFocusRequest] = useState<{ publicId: string; sequence: number } | null>(null);
  const selectedRequest = useMemo(() => focusedPublicId
    ? focusRequest?.publicId === focusedPublicId ? focusRequest : { publicId: focusedPublicId, sequence: 0 }
    : null, [focusedPublicId, focusRequest]);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1050px)').matches);
  const [mapOpen, setMapOpen] = useState(false);
  const mapPanelRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const scrollToMap = useRef(false);
  const scrollRestored = useRef(false);
  const loader = useCallback((signal: AbortSignal) => adminApi.nearbyReports({
    latitude: location.latitude, longitude: location.longitude, page, pageSize,
  }, signal), [location, page]);
  const { data, loading, error, reload } = useAdminData(loader);
  const lastRefreshKey = useRef(refreshKey);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1050px)');
    const update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (lastRefreshKey.current === refreshKey) return;
    lastRefreshKey.current = refreshKey;
    reload();
  }, [refreshKey, reload]);

  useEffect(() => {
    if (!mapOpen || !compact || !scrollToMap.current) return;
    scrollToMap.current = false;
    mapPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [mapOpen, compact, selectedRequest]);

  useEffect(() => {
    if (!data || scrollRestored.current) return;
    scrollRestored.current = true;
    if (!focusedPublicId) return;
    try {
      const saved = window.sessionStorage.getItem(collectionScrollKey);
      window.sessionStorage.removeItem(collectionScrollKey);
      if (!saved) return;
      const position = JSON.parse(saved) as { publicId?: string; page?: number; scrollY?: number; listScrollTop?: number };
      if (position.publicId !== focusedPublicId || position.page !== page) return;
      window.requestAnimationFrame(() => {
        if (typeof position.scrollY === 'number' && Number.isFinite(position.scrollY)) window.scrollTo(0, position.scrollY);
        if (typeof position.listScrollTop === 'number' && Number.isFinite(position.listScrollTop)) listRef.current?.scrollTo(0, position.listScrollTop);
      });
    } catch { /* Storage may be disabled in a private browser session. */ }
  }, [data, focusedPublicId, page]);

  const reports = data?.items ?? noReports;
  const pages = data ? Math.max(1, Math.min(10_000, Math.ceil(data.total / data.pageSize))) : 1;
  const first = data?.items.length ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = first && data ? first + data.items.length - 1 : 0;
  const showMap = !compact || mapOpen;

  useEffect(() => {
    if (data && page > pages) onPageChange(pages);
  }, [data, onPageChange, page, pages]);

  const focusReport = (publicId: string) => {
    setFocusRequest(previous => ({ publicId, sequence: (previous?.sequence ?? 0) + 1 }));
    onFocusChange(publicId);
    if (compact) {
      scrollToMap.current = true;
      setMapOpen(true);
    }
  };

  const rememberScroll = (publicId: string) => {
    try {
      window.sessionStorage.setItem(collectionScrollKey, JSON.stringify({
        publicId, page, scrollY: window.scrollY, listScrollTop: listRef.current?.scrollTop ?? 0,
      }));
    } catch { /* The return URL still restores the mode and list page. */ }
  };

  return <div className={`collection-layout${showMap ? ' with-map' : ''}`}>
    <section className="dashboard-panel collection-list-panel" aria-label="거리순 수거 대상 신고 목록">
      <div className="panel-heading collection-list-heading">
        <div><h2>수거 대상 신고 {data?.mode === 'database' ? `${data.total.toLocaleString('ko-KR')}건` : ''}</h2><p>접수·처리중 신고 · 현재 위치에서 직선거리 가까운 순</p></div>
        <button type="button" className="collection-map-toggle" aria-expanded={mapOpen} onClick={() => { if (!mapOpen) scrollToMap.current = true; setMapOpen(value => !value); }}><MapIcon size={17} aria-hidden="true" />{mapOpen ? '지도 접기' : '지도 보기'}</button>
      </div>
      {loading ? <LoadingState label="가까운 신고를 찾고 있습니다" /> : error ? <ErrorState message={error} onRetry={reload} /> : data?.mode === 'skeleton' ?
        <EmptyState icon={<MapPin size={28} />} title="실제 신고 데이터가 연결되지 않았습니다" description="DB 관리자 계정으로 로그인하면 수거 대상 신고를 볼 수 있습니다." /> : data && <>
          {data.total === 0 ? <EmptyState icon={<MapPin size={28} />} title="수거할 신고가 없습니다" description="접수 또는 처리중인 신고가 생기면 현재 위치와 가까운 순서로 표시합니다." /> : <>
            <p className="collection-list-count" role="status">전체 {data.total.toLocaleString('ko-KR')}건 중 {first.toLocaleString('ko-KR')}–{last.toLocaleString('ko-KR')}건 표시</p>
            <ol ref={listRef} className="collection-report-list">
              {reports.map(report => <li key={report.publicId} className={selectedRequest?.publicId === report.publicId ? 'selected' : undefined}>
                <button type="button" className="collection-report-focus" aria-label={`${report.publicId} 신고 위치 지도에서 보기`} aria-pressed={selectedRequest?.publicId === report.publicId} onClick={() => focusReport(report.publicId)}>
                  <span className="collection-report-head"><span className="collection-report-id">{report.publicId}</span><StatusBadge status={report.status} /></span>
                  <span className="collection-report-fields">
                    <span><span className="collection-field-label">업체</span><span className="collection-field-value">{report.operatorName || '업체 미확인'}</span></span>
                    <span><span className="collection-field-label">기기번호</span><span className="collection-field-value">{report.deviceId || '번호 미확인'}</span></span>
                    <span><span className="collection-field-label">위치</span><span className="collection-field-value">{report.address || `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`}</span></span>
                    <span><span className="collection-field-label">신고유형</span><span className="collection-field-value">{report.categories.length ? report.categories.join(' · ') : '유형 미입력'}</span></span>
                    <span><span className="collection-field-label">직선거리</span><span className="collection-field-value collection-distance">{formatDistance(report.distanceMeters)}</span></span>
                  </span>
                </button>
                <div className="collection-report-actions">
                  <Link className="collection-report-detail" to={`/admin/reports/${encodeURIComponent(report.publicId)}?from=collection&returnTo=${encodeURIComponent(collectionReturnTo(page, report.publicId))}`} state={{ collectionReturnTo: collectionReturnTo(page, report.publicId) }} onClick={() => rememberScroll(report.publicId)}>신고 상세 보기<ArrowUpRight size={15} aria-hidden="true" /></Link>
                  <NaverRouteButtons latitude={report.latitude} longitude={report.longitude} destinationName={report.address || `${report.operatorName} ${report.deviceId}`} />
                </div>
              </li>)}
            </ol>
            {pages > 1 && <nav className="admin-pagination collection-pagination" aria-label="수거 대상 신고 페이지"><Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>이전</Button><span>{page} / {pages} 페이지</span><Button variant="secondary" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>다음</Button></nav>}
          </>}
        </>}
    </section>
    {showMap && <section ref={mapPanelRef} className="dashboard-panel collection-map-panel" aria-label="수거 대상 신고 지도">
      <div className="panel-heading"><div><h2>신고 위치 지도</h2><p>파란 점은 현재 위치, 숫자 표시는 근처에 모인 신고 건수입니다.</p></div>{compact && <button type="button" className="collection-map-close" onClick={() => setMapOpen(false)} aria-label="지도 접기"><X size={18} /></button>}</div>
      <AdminNaverReportMap reports={reports} currentLocation={location} focusRequest={selectedRequest} />
      <p className="collection-map-caption">현재 페이지의 {reports.length.toLocaleString('ko-KR')}건을 지도에 표시합니다. 목록 항목을 누르면 해당 신고의 위치와 정보를 볼 수 있습니다.</p>
    </section>}
  </div>;
}

export function CollectionMode({ refreshKey, page, focusedPublicId, onPageChange, onFocusChange }: CollectionModeProps) {
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [referenceLocation, setReferenceLocation] = useState<CurrentLocation | null>(null);
  const [locating, setLocating] = useState(() => window.isSecureContext && Boolean(navigator.geolocation));
  const [locationError, setLocationError] = useState(() => !window.isSecureContext
    ? '위치 확인은 HTTPS 또는 localhost에서 사용할 수 있습니다.'
    : !navigator.geolocation ? '이 브라우저에서는 위치 확인을 지원하지 않습니다.' : '');
  const lastReference = useRef<CurrentLocation | null>(null);
  const manualRequestId = useRef(0);

  const acceptPosition = useCallback((position: GeolocationPosition, force = false) => {
    const { latitude, longitude, accuracy } = position.coords;
    if (!isValidCoordinates(latitude, longitude)) {
      setLocationError('현재 위치 좌표가 올바르지 않습니다. 다시 확인해 주세요.');
      setLocating(false);
      return;
    }
    const next = { latitude, longitude, accuracy, checkedAt: new Date(position.timestamp || Date.now()) };
    setLocation(next);
    const previous = lastReference.current;
    const elapsed = previous ? next.checkedAt.getTime() - previous.checkedAt.getTime() : Infinity;
    if (force || !previous || (elapsed >= 15_000 && movedMeters(previous, next) >= 20) || elapsed >= 60_000) {
      lastReference.current = next;
      setReferenceLocation(next);
    }
    setLocationError('');
    setLocating(false);
  }, []);

  const requestLocation = useCallback(() => {
    const id = ++manualRequestId.current;
    setLocating(true);
    setLocationError('');
    if (!window.isSecureContext) {
      setLocating(false);
      setLocationError('위치 확인은 HTTPS 또는 localhost에서 사용할 수 있습니다.');
      return;
    }
    if (!navigator.geolocation) {
      setLocating(false);
      setLocationError('이 브라우저에서는 위치 확인을 지원하지 않습니다.');
      return;
    }
    navigator.geolocation.getCurrentPosition(position => {
      if (id !== manualRequestId.current) return;
      acceptPosition(position, true);
    }, error => {
      if (id !== manualRequestId.current) return;
      setLocationError(locationErrorMessage(error));
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  }, [acceptPosition]);

  useEffect(() => {
    if (!window.isSecureContext || !navigator.geolocation) return;
    let active = true;
    let watchId: number | null = null;
    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };
    const start = () => {
      if (watchId !== null || document.hidden) return;
      watchId = navigator.geolocation.watchPosition(position => {
        if (active) acceptPosition(position);
      }, error => {
        if (!active) return;
        setLocationError(locationErrorMessage(error));
        setLocating(false);
      }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 });
    };
    const onVisibilityChange = () => { if (document.hidden) stop(); else start(); };
    start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [acceptPosition]);

  return <div className="collection-mode">
    <div className="collection-location-bar">
      <div><LocateFixed size={19} aria-hidden="true" /><p>{location ? <>현재 위치 <strong>{location.checkedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 갱신</strong>{Number.isFinite(location.accuracy) && <span> · 정확도 약 {Math.round(location.accuracy).toLocaleString('ko-KR')}m</span>}</> : '가까운 신고를 찾으려면 현재 위치가 필요합니다.'}</p></div>
      <Button variant="secondary" onClick={requestLocation} disabled={locating}><LocateFixed size={16} />{locating ? '위치 확인 중' : '현재 위치 다시 확인'}</Button>
    </div>
    {locationError && <p className="collection-location-error" role="alert">{locationError}{location && ' 기존에 확인한 위치를 기준으로 표시합니다.'}</p>}
    {referenceLocation ? <CollectionReports location={referenceLocation} refreshKey={refreshKey} page={page} focusedPublicId={focusedPublicId} onPageChange={onPageChange} onFocusChange={onFocusChange} /> : locating ? <LoadingState label="현재 위치를 확인하고 있습니다" /> : <EmptyState icon={<MapPin size={28} />} title="현재 위치를 확인할 수 없습니다" description="브라우저의 위치 권한을 허용하고 다시 확인해 주세요."><Button variant="secondary" onClick={requestLocation}>현재 위치 다시 확인</Button></EmptyState>}
  </div>;
}
