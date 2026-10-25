import { useEffect, useRef, useState } from 'react';
import type { NaverMap, NaverMaps, NaverMapEventListener, NaverMarker } from './naver';
import { isValidCoordinates } from './location';

export function NaverLocationMap({ maps, latitude, longitude, onMove, onError }: {
  maps: NaverMaps;
  latitude: number;
  longitude: number;
  onMove: (latitude: number, longitude: number) => void;
  onError?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const markerRef = useRef<NaverMarker | null>(null);
  const currentRef = useRef({ latitude, longitude, onMove, onError });
  const [failed, setFailed] = useState(false);
  useEffect(() => { currentRef.current = { latitude, longitude, onMove, onError }; }, [latitude, longitude, onMove, onError]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let dispose: (() => void) | undefined;
    let active = true;
    // The SDK owns the map element and its event listeners only while mounted.
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const position = new maps.LatLng(currentRef.current.latitude, currentRef.current.longitude);
        const map = new maps.Map(container, { center: position, zoom: 17, keyboardShortcuts: true });
        mapRef.current = map;
        dispose = () => map.destroy();
        const marker = new maps.Marker({ map, position, draggable: true, title: '신고 위치 — 핀을 끌어 이동' });
        markerRef.current = marker;
        let resize: ResizeObserver | undefined;
        const dragListeners: NaverMapEventListener[] = [];
        dispose = () => {
          resize?.disconnect();
          try { for (const listener of dragListeners) maps.Event.removeListener(listener); }
          finally { try { marker.setMap(null); } finally { map.destroy(); } }
        };
        dragListeners.push(maps.Event.addListener(marker, 'dragend', () => {
          const moved = marker.getPosition();
          if (active && isValidCoordinates(moved.lat(), moved.lng())) currentRef.current.onMove(moved.lat(), moved.lng());
        }));
        if (typeof ResizeObserver !== 'undefined') {
          resize = new ResizeObserver(() => {
            if (!active) return;
            map.autoResize();
            map.setCenter(marker.getPosition());
          });
          resize.observe(container);
        }
      } catch {
        dispose?.();
        dispose = undefined;
        markerRef.current = null;
        mapRef.current = null;
        if (active) { setFailed(true); currentRef.current.onError?.(); }
      }
    });
    return () => {
      active = false;
      dispose?.();
      markerRef.current = null;
      mapRef.current = null;
      container.replaceChildren();
    };
  }, [maps]);

  useEffect(() => {
    if (!isValidCoordinates(latitude, longitude)) return;
    const position = new maps.LatLng(latitude, longitude);
    markerRef.current?.setPosition(position);
    mapRef.current?.setCenter(position);
  }, [latitude, longitude, maps]);

  return <div className="location-map-frame">
    <div ref={containerRef} className="location-live-map" aria-label="네이버 신고 위치 지도. 핀을 끌어 위치를 수정할 수 있어요." />
    {failed && <div className="location-map-error" role="alert">지도를 표시하지 못했어요. 아래 위도·경도 직접 입력을 이용해 주세요.</div>}
  </div>;
}
