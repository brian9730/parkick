import { MapPin, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AdminMapReport } from '../../api/admin';
import { Button, LoadingState } from '../../components/ui';
import { loadNaverMaps, subscribeNaverAuthFailure } from '../map/naver';
import type { NaverInfoWindow, NaverMap, NaverMapEventListener, NaverMarker } from '../map/naver';
import { isValidCoordinates } from '../map/location';
import { createReportMapInfo, createReportMapMarker } from './map-info';
import { clusterMapReports } from './map-clusters';

const connectionError = '지도를 불러오지 못했습니다. 연결 상태를 확인한 후 다시 시도해 주세요.';

export function AdminNaverReportMap({ reports }: { reports: AdminMapReport[] }) {
  const clientId = (import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined)?.trim() || '';
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ attempt: number; reports: AdminMapReport[]; error: string } | null>(null);
  const current = state?.attempt === attempt && state.reports === reports ? state : null;
  const ready = Boolean(current && !current.error);

  useEffect(() => {
    const container = containerRef.current;
    if (!clientId || !container) return;
    let active = true;
    let authenticationFailed = false;
    let map: NaverMap | null = null;
    let info: NaverInfoWindow | null = null;
    let resize: ResizeObserver | undefined;
    let frame: number | undefined;
    const markers: NaverMarker[] = [];
    const listeners: NaverMapEventListener[] = [];
    let markerEvents: AbortController | undefined;
    let removeListener: ((listener: NaverMapEventListener) => void) | undefined;
    function clearMarkers() {
      markerEvents?.abort();
      markerEvents = undefined;
      for (const marker of markers.splice(0)) marker.setMap(null);
    }
    function dispose() {
      resize?.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      fitRef.current = null;
      info?.close();
      info = null;
      for (const listener of listeners.splice(0)) removeListener?.(listener);
      clearMarkers();
      map?.destroy();
      map = null;
      container?.replaceChildren();
    }
    const unsubscribe = subscribeNaverAuthFailure(() => {
      if (!active) return;
      authenticationFailed = true;
      dispose();
      setState({ attempt, reports, error: '지도 서비스 인증을 확인하지 못했습니다. 지도 연결 설정을 확인한 후 다시 시도해 주세요.' });
    });
    // Loading the shared SDK does not make an address request. Only stored coordinates are used here.
    void loadNaverMaps(clientId).then(maps => {
      if (!active || authenticationFailed) return;
      try {
        if (!maps.Point || !maps.LatLngBounds || !maps.InfoWindow) throw new Error('Map overlays unavailable');
        if (!reports.length || reports.some(report => !isValidCoordinates(report.latitude, report.longitude))) throw new Error('Invalid report coordinates');
        const Point = maps.Point;
        const Bounds = maps.LatLngBounds;
        const firstPosition = new maps.LatLng(reports[0].latitude, reports[0].longitude);
        const samePosition = reports.every(report => report.latitude === reports[0].latitude && report.longitude === reports[0].longitude);
        const instance = new maps.Map(container, { center: firstPosition, zoom: 17, keyboardShortcuts: true });
        map = instance;
        if (!instance.fitBounds || !instance.setZoom || !instance.getZoom || !instance.getMaxZoom || !instance.getProjection) throw new Error('Map projection unavailable');
        const fitBounds = instance.fitBounds.bind(instance);
        const setZoom = instance.setZoom.bind(instance);
        const getZoom = instance.getZoom.bind(instance);
        const getMaxZoom = instance.getMaxZoom.bind(instance);
        const getProjection = instance.getProjection.bind(instance);
        const boundsFor = (items: AdminMapReport[]) => new Bounds(
          new maps.LatLng(Math.min(...items.map(report => report.latitude)), Math.min(...items.map(report => report.longitude))),
          new maps.LatLng(Math.max(...items.map(report => report.latitude)), Math.max(...items.map(report => report.longitude))),
        );
        const padding = { top: 60, right: 60, bottom: 60, left: 60 };
        let signature = '';
        let focusReport: string | null = null;
        const fit = () => {
          if (!active || authenticationFailed) return;
          info?.close();
          if (samePosition) { instance.setCenter(firstPosition); setZoom(17); }
          else fitBounds(boundsFor(reports), { ...padding, maxZoom: 17 });
          scheduleRender();
        };
        fitRef.current = fit;
        const infoWindow = new maps.InfoWindow({ content: document.createElement('div'), maxWidth: 300, borderWidth: 0, backgroundColor: 'transparent', disableAnchor: true });
        info = infoWindow;
        removeListener = listener => maps.Event.removeListener(listener);
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
          infoWindow.close();
          clearMarkers();
          markerEvents = new AbortController();
          for (const cluster of clusters) {
            const group = cluster.reports;
            const position = new maps.LatLng(cluster.latitude, cluster.longitude);
            const expandable = cluster.hasDistinctPositions && zoom < maxZoom;
            const icon = createReportMapMarker(group, expandable);
            const marker = new maps.Marker({ map: instance, position, draggable: false, title: icon.title, icon: { content: icon, anchor: new Point(20, 20), size: { width: 40, height: 40 } } });
            markers.push(marker);
            const activate = () => {
              if (!active || authenticationFailed) return;
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
                infoWindow.setContent(createReportMapInfo(group, () => { infoWindow.close(); icon.focus(); }));
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
        }
        function scheduleRender() {
          if (!active || authenticationFailed || frame !== undefined) return;
          frame = requestAnimationFrame(() => {
            frame = undefined;
            try { renderMarkers(); }
            catch { dispose(); if (active) setState({ attempt, reports, error: connectionError }); }
          });
        }
        for (const event of ['idle', 'zoom_changed', 'size_changed'] as const) listeners.push(maps.Event.addListener(instance, event, scheduleRender));
        fit();
        renderMarkers();
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
        setState({ attempt, reports, error: '' });
      } catch {
        dispose();
        if (active) setState({ attempt, reports, error: connectionError });
      }
    }).catch(() => {
      if (active && !authenticationFailed) setState({ attempt, reports, error: connectionError });
    });
    return () => { active = false; unsubscribe(); dispose(); };
  }, [clientId, reports, attempt]);

  return <>
    {ready && <div className="admin-map-toolbar"><Button variant="secondary" className="admin-map-fit" onClick={() => fitRef.current?.()}><MapPin size={15} />표시된 신고 모아보기</Button></div>}
    <div className="admin-map-frame">
      <div ref={containerRef} className="admin-report-map" role="region" aria-label="신고 위치 지도" aria-busy={Boolean(clientId && !current)} />
      {!clientId || current?.error ? <div className="admin-map-unavailable" role={current?.error ? 'alert' : 'status'}><MapPin size={28} aria-hidden="true" /><strong>{!clientId ? '지도 서비스 미연결' : '지도를 불러오지 못했어요'}</strong><p>{!clientId ? '지도 연결 설정이 필요합니다. 신고 목록에서 접수된 내용을 확인할 수 있어요.' : current?.error}</p>{clientId && <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}><RotateCcw size={16} />지도 다시 연결</Button>}</div>
        : !ready && <div className="admin-map-loading"><LoadingState label="신고 위치 지도를 불러오고 있습니다" /></div>}
    </div>
  </>;
}
