import { Camera, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { getLivePhotoGuidance } from '../../api/reports';
import type { LivePhotoGuidanceStatus } from '../../api/reports';
import { Button } from '../../components/ui';

const ANALYSIS_INTERVAL_MS = 4_000;
const MAX_ANALYSIS_CALLS = 8;
const ANALYSIS_MAX_EDGE = 640;

const fallbackMessages: Record<LivePhotoGuidanceStatus, string> = {
  ready: '좋아요. 기기 전체가 잘 보입니다. 촬영해 주세요.',
  move_closer: '기기가 작게 보여요. 조금 가까이 가서 찍어 주세요.',
  center_subject: '기기를 화면 가운데에 놓아 주세요.',
  show_full_vehicle: '기기 전체가 화면 안에 들어오게 해 주세요.',
  no_vehicle: '공유 킥보드나 자전거가 보이도록 화면을 맞춰 주세요.',
  uncertain: '기기가 잘 보이도록 화면을 조정해 주세요.',
};

type GuidanceState = LivePhotoGuidanceStatus | 'waiting' | 'unavailable';

function cameraErrorMessage(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
    return '카메라 권한을 허용할 수 없어요. 브라우저 설정을 확인하거나 기본 카메라로 촬영해 주세요.';
  }
  if (cause instanceof DOMException && cause.name === 'NotFoundError') {
    return '사용할 수 있는 카메라가 없어요. 기본 카메라로 촬영해 주세요.';
  }
  return '카메라를 시작할 수 없어요. 기본 카메라로 촬영해 주세요.';
}

function canvasJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob?.size && blob.type === 'image/jpeg') resolve(blob);
    else reject(new Error('사진을 만들지 못했어요. 다시 촬영해 주세요.'));
  }, 'image/jpeg', quality));
}

export function LivePhotoCamera({ onCapture, onClose, onNativeCapture }: {
  onCapture: (file: File) => void;
  onClose: () => void;
  onNativeCapture: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopSessionRef = useRef<(() => void) | null>(null);
  const activeRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [guidanceState, setGuidanceState] = useState<GuidanceState>('waiting');
  const [guidanceMessage, setGuidanceMessage] = useState('기기 전체를 점선 안에 넣고 화면을 맞춰 주세요.');
  const [analysisCount, setAnalysisCount] = useState(0);
  const [videoRatio, setVideoRatio] = useState(4 / 3);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let firstCheck: number | undefined;
    let request: AbortController | null = null;
    let pending = false;
    let calls = 0;
    let analysisUnavailable = false;
    const video = videoRef.current;
    activeRef.current = true;

    function stopSession() {
      if (!active) return;
      active = false;
      activeRef.current = false;
      window.clearInterval(timer);
      window.clearTimeout(firstCheck);
      request?.abort();
      stream?.getTracks().forEach(track => track.stop());
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    }

    stopSessionRef.current = stopSession;

    async function checkFrame() {
      if (!active || pending || analysisUnavailable || calls >= MAX_ANALYSIS_CALLS || document.hidden
        || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
      pending = true;
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, ANALYSIS_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      try {
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('프레임을 읽을 수 없습니다.');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = await canvasJpeg(canvas, 0.7);
        if (!active) return;
        const controller = new AbortController();
        request = controller;
        calls += 1;
        setAnalysisCount(calls);
        setChecking(true);
        const result = await getLivePhotoGuidance(frame, controller.signal);
        if (!active || controller.signal.aborted) return;
        const message = result.message.trim();
        setGuidanceState(result.status);
        setGuidanceMessage(message && message.length <= 120 ? message : fallbackMessages[result.status]);
      } catch (cause) {
        if (!active || request?.signal.aborted) return;
        analysisUnavailable = true;
        setGuidanceState('unavailable');
        setGuidanceMessage(cause instanceof ApiError && cause.status === 429
          ? '잠시 동안 AI 안내를 더 받을 수 없어요. 기기 전체가 보이도록 촬영해 주세요.'
          : '실시간 AI 안내에 연결할 수 없어요. 기기 전체가 보이도록 촬영해 주세요.');
      } finally {
        canvas.width = canvas.height = 0;
        request = null;
        pending = false;
        if (active) setChecking(false);
      }
    }

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        if (!video) throw new Error('카메라 화면을 열 수 없습니다.');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        if (!active) return;
        if (video.videoWidth && video.videoHeight) setVideoRatio(video.videoWidth / video.videoHeight);
        setCameraReady(true);
        firstCheck = window.setTimeout(() => { void checkFrame(); }, 700);
        timer = window.setInterval(() => { void checkFrame(); }, ANALYSIS_INTERVAL_MS);
      } catch (cause) {
        if (!active) return;
        stream?.getTracks().forEach(track => track.stop());
        if (video) video.srcObject = null;
        setCameraError(cameraErrorMessage(cause));
      }
    }

    const closeWhenHidden = () => { if (document.hidden) onClose(); };
    document.addEventListener('visibilitychange', closeWhenHidden);
    void startCamera();
    return () => {
      document.removeEventListener('visibilitychange', closeWhenHidden);
      stopSession();
      stopSessionRef.current = null;
    };
  }, [onClose]);

  async function capture() {
    const video = videoRef.current;
    if (!cameraReady || capturing || !video?.videoWidth || !video.videoHeight) return;
    setCapturing(true);
    setCaptureError(null);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    try {
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('사진을 만들지 못했어요. 다시 촬영해 주세요.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasJpeg(canvas, 0.9);
      if (!activeRef.current) return;
      stopSessionRef.current?.();
      onCapture(new File([blob], `parkick-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
    } catch (cause) {
      if (activeRef.current) setCaptureError(cause instanceof Error ? cause.message : '사진을 만들지 못했어요. 다시 촬영해 주세요.');
    } finally {
      canvas.width = canvas.height = 0;
      if (activeRef.current) setCapturing(false);
    }
  }

  function fallbackToNative() {
    stopSessionRef.current?.();
    onNativeCapture();
  }

  return <section className="photo-live-camera" aria-label="실시간 촬영 안내">
    <div className="photo-live-heading"><strong>카메라 촬영</strong><button type="button" className="photo-live-close" aria-label="카메라 닫기" onClick={onClose}><X size={19} aria-hidden="true" /></button></div>
    {!cameraError && <div className="photo-live-viewfinder" style={{ aspectRatio: videoRatio, width: `min(100%, 440px, ${(62 * videoRatio).toFixed(1)}vh)` }}>
      <video ref={videoRef} autoPlay muted playsInline aria-label="촬영 중인 카메라 화면" />
      <div className="photo-live-outline" aria-hidden="true" />
      {!cameraReady && <span className="photo-live-loading"><LoaderCircle size={22} className="spin" aria-hidden="true" /> 카메라를 여는 중…</span>}
    </div>}
    {cameraError ? <p className="inline-error" role="alert">{cameraError}</p> : <>
      <p className="photo-live-guidance" role="status" data-guidance-status={guidanceState}>
        {checking && <LoaderCircle size={16} className="spin" aria-hidden="true" />}{guidanceMessage}
      </p>
      <p className="photo-live-privacy">AI 안내를 위해 촬영 중 프레임을 전송하지만, 신고 사진으로 저장하지 않습니다.</p>
      {analysisCount >= MAX_ANALYSIS_CALLS && <p className="photo-live-limit">AI 안내 횟수가 끝났어요. 현재 화면으로 계속 촬영할 수 있습니다.</p>}
      {captureError && <p className="inline-error" role="alert">{captureError}</p>}
    </>}
    <div className="photo-live-actions">
      {!cameraError && <Button onClick={() => void capture()} disabled={!cameraReady || capturing}><Camera size={18} aria-hidden="true" />{capturing ? '사진 준비 중…' : '사진 찍기'}</Button>}
      {(cameraError || guidanceState === 'unavailable') && <Button variant="secondary" onClick={fallbackToNative}>기본 카메라로 촬영</Button>}
      {!cameraError && <Button variant="quiet" onClick={onClose}>취소</Button>}
    </div>
  </section>;
}
