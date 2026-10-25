import { CarFront, Footprints } from 'lucide-react';
import { useState } from 'react';
import { NAVER_MAPS_IOS_STORE_URL, buildNaverRouteUrl, naverRoutePlatform } from './naver-route';
import type { NaverRouteMode } from './naver-route';
import './NaverRouteButtons.css';

interface NaverRouteButtonsProps {
  latitude: number;
  longitude: number;
  destinationName?: string | null;
}

export function NaverRouteButtons({ latitude, longitude, destinationName }: NaverRouteButtonsProps) {
  const [copyFeedback, setCopyFeedback] = useState('');
  const platform = naverRoutePlatform(window.navigator.userAgent, window.navigator.maxTouchPoints);
  const coordinates = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  const copyLocation = async () => {
    try {
      await window.navigator.clipboard.writeText(`${destinationName?.trim() || '신고 위치'} (${coordinates})`);
      setCopyFeedback('위치를 복사했습니다.');
    } catch {
      setCopyFeedback(`복사할 좌표: ${coordinates}`);
    }
  };

  const openRoute = (mode: NaverRouteMode) => {
    let url: string;
    try {
      url = buildNaverRouteUrl({
        latitude, longitude, destinationName, mode, platform, appUrl: window.location.href,
      });
    } catch {
      window.alert('길찾기에 사용할 위치가 올바르지 않습니다.');
      return;
    }

    if (platform !== 'ios') {
      window.location.assign(url);
      return;
    }

    // The mobile web cannot query whether another iOS app is installed. NAVER's
    // documented fallback opens the App Store if the page remains visible.
    let appOpened = false;
    const onLeave = () => { appOpened = true; };
    document.addEventListener('visibilitychange', onLeave, { once: true });
    window.addEventListener('pagehide', onLeave, { once: true });
    const openedAt = Date.now();
    window.location.assign(url);
    window.setTimeout(() => {
      document.removeEventListener('visibilitychange', onLeave);
      window.removeEventListener('pagehide', onLeave);
      if (!appOpened && document.visibilityState === 'visible' && Date.now() - openedAt < 2_500) {
        window.location.assign(NAVER_MAPS_IOS_STORE_URL);
      }
    }, 1_500);
  };

  if (platform === 'other') return <div className="naver-route-buttons" role="group" aria-label="신고 위치 복사">
    <button type="button" className="naver-route-button" onClick={copyLocation}>위치 복사</button>
    {copyFeedback && <span className="naver-route-feedback" role="status">{copyFeedback}</span>}
  </div>;

  return <div className="naver-route-buttons" role="group" aria-label="네이버 지도 길찾기">
    <button type="button" className="naver-route-button" onClick={() => openRoute('walk')}><Footprints size={15} aria-hidden="true" />도보 길찾기</button>
    <button type="button" className="naver-route-button" onClick={() => openRoute('car')}><CarFront size={15} aria-hidden="true" />차량 길찾기</button>
  </div>;
}
