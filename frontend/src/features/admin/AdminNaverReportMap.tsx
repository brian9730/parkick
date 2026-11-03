import { MapPin, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AdminHotspotZone, AdminMapReport } from '../../api/admin';
import { Button, LoadingState } from '../../components/ui';
import { loadNaverMaps, subscribeNaverAuthFailure } from '../map/naver';
import type { NaverCircle, NaverInfoWindow, NaverMap, NaverMapEventListener, NaverMarker } from '../map/naver';
import { isValidCoordinates } from '../map/location';
import { createReportMapInfo, createReportMapMarker } from './map-info';
import { clusterMapReports } from './map-clusters';

const connectionError = '지도를 불러오지 못했습니다. 연결 상태를 확인한 후 다시 시도해 주세요.';

interface CurrentLocation { latitude: number; longitude: number }
interface ReportFocusRequest { publicId: string; sequence: number }

export function AdminNaverReportMap({ reports, currentLocation, focusRequest, hotspots, showHotspots = false, hotspotPanel, detailBasePath = '/admin/reports', collectionPage = 1 }: {
  reports: AdminMapReport[];
  currentLocation?: CurrentLocation;
  focusRequest?: ReportFocusRequest | null;
  hotspots?: AdminHotspotZone[];
  showHotspots?: boolean;
  hotspotPanel?: ReactNode;
  detailBasePath?: '/admin/reports' | '/collect/reports';
  collectionPage?: number;
}) {
  const clientId = (import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined)?.trim() || '';
  const currentLatitude = currentLocation?.latitude;
  const currentLongitude = currentLocation?.longitude;
  const hasCurrentLocation = currentLatitude !== undefined && currentLongitude !== undefined
    && isValidCoordinates(currentLatitude, currentLongitude);
  const locationKey = hasCurrentLocation ? `${currentLatitude},${currentLongitude}` : '';
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const focusRef = useRef<((request: ReportFocusRequest) => void) | null>(null);
  const hotspotRendererRef = useRef<((zones: AdminHotspotZone[], enabled: boolean) => void) | null>(null);
  const hotspotInputRef = useRef({ zones: hotspots ?? [], enabled: showHotspots });
  const pendingFocusRef = useRef<ReportFocusRequest | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ attempt: number; reports: AdminMapReport[]; locationKey: string; error: string } | null>(null);
  const current = state?.attempt === attempt && state.reports === reports && state.locationKey === locationKey ? state : null;
  const ready = Boolean(current && !current.error);

  useEffect(() => {
    hotspotInputRef.current = { zones: hotspots ?? [], enabled: showHotspots };
    hotspotRendererRef.current?.(hotspotInputRef.current.zones, hotspotInputRef.current.enabled);
  }, [hotspots, showHotspots]);

  useEffect(() => {
    const container = containerRef.current;
    if (!clientId || !container) return;
    let active = true;
    let authenticationFailed = false;
    let map: NaverMap | null = null;
    let info: NaverInfoWindow | null = null;
    let locationMarker: NaverMarker | null = null;
    let resize: ResizeObserver | undefined;
    let frame: number | undefined;
    const markers: NaverMarker[] = [];
    const hotspotCircles: NaverCircle[] = [];
    const listeners: NaverMapEventListener[] = [];
    let markerEvents: AbortController | undefined;
    let removeListener: ((listener: NaverMapEventListener) => void) | undefined;
    function clearMarkers() {
      markerEvents?.abort();
      markerEvents = undefined;
      for (const marker of markers.splice(0)) marker.setMap(null);
    }
    function clearHotspots() {
      for (const circle of hotspotCircles.splice(0)) circle.setMap(null);
    }
    function dispose() {
      resize?.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      fitRef.current = null;
      focusRef.current = null;
      hotspotRendererRef.current = null;
      info?.close();
      info = null;
      for (const listener of listeners.splice(0)) removeListener?.(listener);
      clearMarkers();
      clearHotspots();
      locationMarker?.setMap(null);
      locationMarker = null;
      map?.destroy();
      map = null;
      container?.replaceChildren();
    }
    const unsubscribe = subscribeNaverAuthFailure(() => {
      if (!active) return;
      authenticationFailed = true;
      dispose();
      setState({ attempt, reports, locationKey, error: '지도 서비스 인증을 확인하지 못했습니다. 지도 연결 설정을 확인한 후 다시 시도해 주세요.' });
    });
    // Loading the shared SDK does not make an address request. Only stored coordinates are used here.
    void loadNaverMaps(clientId).then(maps => {
      if (!active || authenticationFailed) return;
      try {
        if (!maps.Point || !maps.LatLngBounds || !maps.InfoWindow) throw new Error('Map overlays unavailable');
        if ((!reports.length && !hasCurrentLocation) || reports.some(report => !isValidCoordinates(report.latitude, report.longitude))) throw new Error('Invalid report coordinates');
        const Point = maps.Point;
        const Bounds = maps.LatLngBounds;
        const currentPosition = hasCurrentLocation ? new maps.LatLng(currentLatitude, currentLongitude) : null;
        const firstPosition = currentPosition ?? new maps.LatLng(reports[0].latitude, reports[0].longitude);
        const samePosition = reports.every(report => report.latitude === reports[0].latitude && report.longitude === reports[0].longitude);
        const instance = new maps.Map(container, { center: firstPosition, zoom: 17, keyboardShortcuts: true });
        map = instance;
        if (currentPosition) {
          const dot = document.createElement('span');
          dot.className = 'admin-map-current-location';
          dot.setAttribute('role', 'img');
          dot.setAttribute('aria-label', '현재 위치');
          locationMarker = new maps.Marker({
            map: instance, position: currentPosition, draggable: false, title: '현재 위치',
            icon: { content: dot, anchor: new Point(11, 11), size: { width: 22, height: 22 } },
          });
        }
        if (!instance.fitBounds || !instance.setZoom || !instance.getZoom || !instance.getMaxZoom || !instance.getProjection) throw new Error('Map projection unavailable');
        const fitBounds = instance.fitBounds.bind(instance);
        const setZoom = instance.setZoom.bind(instance);
        const getZoom = instance.getZoom.bind(instance);
        const getMaxZoom = instance.getMaxZoom.bind(instance);
        const getProjection = instance.getProjection.bind(instance);
        const boundsFor = (items: Array<Pick<AdminMapReport, 'latitude' | 'longitude'>>) => new Bounds(
          new maps.LatLng(Math.min(...items.map(report => report.latitude)), Math.min(...items.map(report => report.longitude))),
          new maps.LatLng(Math.max(...items.map(report => report.latitude)), Math.max(...items.map(report => report.longitude))),
        );
        const padding = { top: 60, right: 60, bottom: 60, left: 60 };
        const nearestReports = reports.slice(0, 5);
        let signature = '';
        let focusReport: string | null = null;
        let selectedReportId: string | null = null;
        const fit = () => {
          if (!active || authenticationFailed) return;
          selectedReportId = null;
          info?.close();
          if (currentPosition) {
            if (!nearestReports.length || nearestReports.every(report => report.latitude === currentPosition.lat() && report.longitude === currentPosition.lng())) {
              instance.setCenter(currentPosition);
              setZoom(17);
            } else {
              fitBounds(boundsFor([
                { latitude: currentPosition.lat(), longitude: currentPosition.lng() },
                ...nearestReports,
              ]), { ...padding, maxZoom: 17 });
            }
          } else if (samePosition) { instance.setCenter(firstPosition); setZoom(17); }
          else fitBounds(boundsFor(reports), { ...padding, maxZoom: 17 });
          scheduleRender();
        };
        fitRef.current = fit;
        const infoWindow = new maps.InfoWindow({ content: document.createElement('div'), maxWidth: 300, borderWidth: 0, backgroundColor: 'transparent', disableAnchor: true });
        info = infoWindow;
        removeListener = listener => maps.Event.removeListener(listener);
        hotspotRendererRef.current = (zones, enabled) => {
          clearHotspots();
          if (!enabled || !maps.Circle) return;
          for (const zone of zones) {
            if (!isValidCoordinates(zone.latitude, zone.longitude) || !Number.isFinite(zone.radiusMeters) || zone.radiusMeters <= 0 || zone.count < 3) continue;
            const center = new maps.LatLng(zone.latitude, zone.longitude);
            const color = zone.level === 'red' ? '#e54c5d' : '#e9b931';
            hotspotCircles.push(new maps.Circle({
              map: instance, center, radius: zone.radiusMeters, fillColor: color, fillOpacity: 0.19,
              strokeColor: color, strokeOpacity: 0.9, strokeWeight: 2, clickable: false,
            }));
          }
        };
        hotspotRendererRef.current(hotspotInputRef.current.zones, hotspotInputRef.current.enabled);
        function renderMarkers() {
          if (!active || authenticationFailed) return;
          const zoom = getZoom();
          const maxZoom = getMaxZoom();
          if (!Number.isFinite(zoom) || !Number.isFinite(maxZoom)) throw new Error('Map zoom unavailable');
          const projection = getProjection();
          const clusters = clusterMapReports(reports, report => projection.fromCoordToOffset(new maps.LatLng(report.latitude, report.longitude)));
          const nextSignature = JSON.stringify(clusters.map(cluster => [cluster.reports.map(report => report.publicId), cluster.hasDistinctPositions && zoom < maxZoom]));
          // Opening an info window can pan the map and emit idle. Keep the popup
          // and focused marker when the actual cluster membership is unchanged.
          if (signature === nextSignature) return;
          signature = nextSignature;
          // A selected report's info window is anchored to its real coordinates,
          // so rebuilding nearby cluster markers must not dismiss it.
          if (!selectedReportId) infoWindow.close();
          clearMarkers();
          markerEvents = new AbortController();
          for (const cluster of clusters) {
            const group = cluster.reports;
            const position = new maps.LatLng(cluster.latitude, cluster.longitude);
            const expandable = cluster.hasDistinctPositions && zoom < maxZoom;
            const icon = createReportMapMarker(group, expandable);
            const marker = new maps.Marker({ map: instance, position, draggable: false, zIndex: 10, title: icon.title, icon: { content: icon, anchor: new Point(20, 20), size: { width: 40, height: 40 } } });
            markers.push(marker);
            const activate = () => {
              if (!active || authenticationFailed) return;
              selectedReportId = null;
              if (expandable) {
                if (document.activeElement === icon) focusReport = group[0].publicId;
                infoWindow.close();
                const previousZoom = getZoom();
                fitBounds(boundsFor(group), { ...padding, maxZoom: getMaxZoom() });
                // A long connected cluster can already fill the viewport. A
                // further zoom must still make progress instead of re-fitting.
                if (getZoom() <= previousZoom) {
                  instance.setCenter(position);
                  setZoom(Math.min(getMaxZoom(), previousZoom + 1));
                }
                scheduleRender();
              } else {
                infoWindow.setContent(createReportMapInfo(group, () => { infoWindow.close(); icon.focus(); }, detailBasePath, collectionPage));
                infoWindow.open(instance, position);
              }
            };
            // A single native button event handles mouse, touch and keyboard.
            // Also registering the SDK marker click would activate twice.
            icon.addEventListener('click', event => { event.stopPropagation(); activate(); }, { signal: markerEvents.signal });
            if (focusReport && group.some(report => report.publicId === focusReport)) {
              icon.focus({ preventScroll: true });
              focusReport = null;
            }
          }
          // Keep the position dot visible when a report has the same coordinates.
          if (locationMarker) { locationMarker.setMap(null); locationMarker.setMap(instance); }
        }
        function scheduleRender() {
          if (!active || authenticationFailed || frame !== undefined) return;
          frame = requestAnimationFrame(() => {
            frame = undefined;
            try { renderMarkers(); }
            catch { dispose(); if (active) setState({ attempt, reports, locationKey, error: connectionError }); }
          });
        }
        for (const event of ['idle', 'zoom_changed', 'size_changed'] as const) listeners.push(maps.Event.addListener(instance, event, scheduleRender));
        fit();
        renderMarkers();
        focusRef.current = request => {
          if (!active || authenticationFailed) return;
          const report = reports.find(item => item.publicId === request.publicId);
          if (!report) return;
          const position = new maps.LatLng(report.latitude, report.longitude);
          selectedReportId = report.publicId;
          instance.setCenter(position);
          const zoom = getZoom();
          setZoom(Math.min(getMaxZoom(), Math.max(Number.isFinite(zoom) ? zoom : 17, 19)));
          scheduleRender();
          infoWindow.setContent(createReportMapInfo([report], () => {
            selectedReportId = null;
            infoWindow.close();
          }, detailBasePath, collectionPage));
          infoWindow.open(instance, position);
        };
        if (pendingFocusRef.current) focusRef.current(pendingFocusRef.current);
        if (typeof ResizeObserver !== 'undefined') {
          let width = container.clientWidth;
          let height = container.clientHeight;
          resize = new ResizeObserver(() => {
            if (!active || authenticationFailed || (width === container.clientWidth && height === container.clientHeight)) return;
            width = container.clientWidth; height = container.clientHeight;
            instance.autoResize();
            scheduleRender();
          });
          resize.observe(container);
        }
        setState({ attempt, reports, locationKey, error: '' });
      } catch {
        dispose();
        if (active) setState({ attempt, reports, locationKey, error: connectionError });
      }
    }).catch(() => {
      if (active && !authenticationFailed) setState({ attempt, reports, locationKey, error: connectionError });
    });
    return () => { active = false; unsubscribe(); dispose(); };
  }, [clientId, reports, attempt, currentLatitude, currentLongitude, hasCurrentLocation, locationKey, detailBasePath, collectionPage]);

  useEffect(() => {
    pendingFocusRef.current = focusRequest ?? null;
    if (focusRequest) focusRef.current?.(focusRequest);
  }, [focusRequest]);

  return <>
    {ready && <div className="admin-map-toolbar"><Button variant="secondary" className="admin-map-fit" onClick={() => fitRef.current?.()}><MapPin size={15} />{hasCurrentLocation ? reports.length ? '현재 위치와 가까운 신고 보기' : '현재 위치로 이동' : '표시된 신고 모아보기'}</Button></div>}
    <div className="admin-map-frame">
      <div ref={containerRef} className="admin-report-map" role="region" aria-label="신고 위치 지도" aria-busy={Boolean(clientId && !current)} />
      {ready && hotspotPanel}
      {!clientId || current?.error ? <div className="admin-map-unavailable" role={current?.error ? 'alert' : 'status'}><MapPin size={28} aria-hidden="true" /><strong>{!clientId ? '지도 서비스 미연결' : '지도를 불러오지 못했어요'}</strong><p>{!clientId ? '지도 연결 설정이 필요합니다. 신고 목록에서 접수된 내용을 확인할 수 있어요.' : current?.error}</p>{clientId && <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}><RotateCcw size={16} />지도 다시 연결</Button>}</div>
        : !ready && <div className="admin-map-loading"><LoadingState label="신고 위치 지도를 불러오고 있습니다" /></div>}
    </div>
  </>;
}
