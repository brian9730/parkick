import { Camera, ImagePlus, LoaderCircle, QrCode, Square } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type QrScanner from 'qr-scanner';
import { Button } from '../../components/ui';
import { PHOTO_ACCEPT, validatePhotoFile } from '../photos/validation';
import { scanQrImage } from './scan-qr-image';
import './QRScanner.css';

type ScanState = 'idle' | 'starting' | 'scanning' | 'image' | 'decoded';
type CameraSession = { scanner: QrScanner; video: HTMLVideoElement };

function releaseCamera(session: CameraSession) {
  // Each run owns its video element: qr-scanner's deferred stop must never stop a newer run's stream.
  void session.scanner.pause(true);
  session.scanner.destroy();
  const stream = session.video.srcObject;
  if (stream instanceof MediaStream) for (const track of stream.getTracks()) track.stop();
  session.video.srcObject = null;
  session.video.remove();
}

function cameraError(cause: unknown): string {
  const name = cause instanceof DOMException ? cause.name : '';
  const message = cause instanceof Error ? cause.message : String(cause);
  if (name === 'NotAllowedError' || /permission|denied|notallowed/i.test(message)) {
    return '카메라 사용이 허용되지 않았어요. 브라우저의 카메라 권한을 허용하거나 아래에서 직접 입력해 주세요.';
  }
  if (name === 'NotFoundError') {
    return '사용 가능한 카메라가 없어요. QR 사진을 선택하거나 아래에서 직접 입력해 주세요.';
  }
  if (name === 'NotReadableError' || /notreadable|in use|could not start/i.test(message)) {
    return '카메라를 사용할 수 없어요. 다른 앱의 카메라를 닫고 다시 시도하거나 직접 입력해 주세요.';
  }
  // qr-scanner collapses permission/device errors into "Camera not found."; do not claim the device is absent.
  if (/camera not found/i.test(message)) {
    return '카메라를 시작하지 못했어요. 브라우저의 카메라 권한과 기기 연결을 확인하거나 아래에서 직접 입력해 주세요.';
  }
  return '카메라를 시작하지 못했어요. QR 사진을 선택하거나 아래에서 직접 입력해 주세요.';
}

export function QRScanner({ onDecoded, disabled = false }: { onDecoded: (rawQr: string) => void; disabled?: boolean }) {
  const [state, setState] = useState<ScanState>('idle');
  const [error, setError] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const active = useRef<CameraSession | null>(null);
  const generation = useRef(0);
  const onDecodedRef = useRef(onDecoded);
  useEffect(() => { onDecodedRef.current = onDecoded; }, [onDecoded]);

  const release = useCallback(() => {
    generation.current += 1;
    const previous = active.current;
    active.current = null;
    if (previous) releaseCamera(previous);
  }, []);

  // A manual change remounts this session. Invalidate callbacks and stop its
  // camera during commit, before a pending local decode can deliver its result.
  useLayoutEffect(() => release, [release]);

  function stop() {
    release();
    setState('idle');
  }

  async function start() {
    if (disabled || state === 'starting' || state === 'scanning' || state === 'image') return;
    release();
    setError(null);
    if (!window.isSecureContext) {
      setError('카메라는 HTTPS 연결에서 사용할 수 있어요. QR 사진을 선택하거나 아래에서 직접 입력해 주세요.');
      setState('idle');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저는 카메라 촬영을 지원하지 않아요. QR 사진을 선택하거나 아래에서 직접 입력해 주세요.');
      setState('idle');
      return;
    }
    const currentGeneration = generation.current;
    setState('starting');
    let session: CameraSession | null = null;
    let createdVideo: HTMLVideoElement | null = null;
    try {
      const { default: Scanner } = await import('qr-scanner');
      if (currentGeneration !== generation.current || !host.current) return;
      const video = document.createElement('video');
      createdVideo = video;
      video.playsInline = true;
      video.muted = true;
      video.setAttribute('aria-label', 'QR 코드 촬영 카메라');
      host.current.appendChild(video);
      const scanner = new Scanner(video, result => {
        if (currentGeneration !== generation.current) return;
        release();
        setState('decoded');
        onDecodedRef.current(result.data);
      }, { preferredCamera: 'environment', maxScansPerSecond: 10, returnDetailedScanResult: true });
      session = { scanner, video };
      active.current = session;
      await scanner.start();
      if (currentGeneration !== generation.current) {
        releaseCamera(session);
        return;
      }
      setState('scanning');
    } catch (cause) {
      if (currentGeneration !== generation.current) return;
      release();
      createdVideo?.remove();
      setState('idle');
      setError(cameraError(cause));
    }
  }

  async function scanImage(file: File) {
    release();
    const currentGeneration = generation.current;
    setError(null);
    setState('image');
    try {
      await validatePhotoFile(file);
      if (currentGeneration !== generation.current) return;
      const { default: Scanner } = await import('qr-scanner');
      if (currentGeneration !== generation.current) return;
      const result = await scanQrImage(Scanner, file, () => currentGeneration === generation.current);
      if (currentGeneration !== generation.current) return;
      setState('decoded');
      onDecodedRef.current(result.data);
    } catch (cause) {
      if (currentGeneration !== generation.current) return;
      setState('idle');
      setError(cause instanceof Error ? cause.message : '사진에서 QR 코드를 찾지 못했어요. 선명한 QR 사진을 다시 선택하거나 직접 입력해 주세요.');
    }
  }

  const cameraRunning = state === 'starting' || state === 'scanning';
  const busy = state === 'starting' || state === 'image';
  return <section className="qr-capture" aria-label="QR 코드 촬영">
    <div className={`qr-live-frame ${cameraRunning ? 'is-active' : ''}`}>
      <div className="qr-video-stage" ref={host} />
      {cameraRunning ? <div className="qr-live-guide" aria-hidden="true" /> : <div className="qr-idle-content"><span className="scan-frame"><QrCode size={44} aria-hidden="true" /></span><strong>{state === 'decoded' ? 'QR 코드를 읽었어요' : '킥보드의 QR 코드를 비춰주세요'}</strong><p>기기에 붙어 있는 QR 코드를 촬영해 주세요.</p></div>}
      {busy && <div className="qr-busy" role="status"><LoaderCircle className="spin" size={22} aria-hidden="true" /><span>{state === 'image' ? 'QR 사진을 확인하고 있어요…' : '카메라를 연결하고 있어요…'}</span></div>}
    </div>
    <div className="capture-actions">{cameraRunning ? <Button variant="secondary" onClick={stop}><Square size={16} aria-hidden="true" />카메라 중지</Button> : <Button disabled={disabled || busy} onClick={() => void start()}><Camera size={18} aria-hidden="true" />카메라로 QR 스캔</Button>}<Button variant="secondary" disabled={disabled || busy} onClick={() => imageInput.current?.click()}><ImagePlus size={18} aria-hidden="true" />QR 사진 선택</Button></div>
    <input ref={imageInput} className="sr-only" tabIndex={-1} type="file" accept={PHOTO_ACCEPT} aria-label="QR 코드 사진 선택" disabled={disabled || busy} onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (file) void scanImage(file);
    }} />
    <p className="field-hint" role="status">{state === 'scanning' ? 'QR 코드를 화면 중앙에 맞춰 주세요. 읽으면 카메라가 자동으로 꺼집니다.' : 'QR을 읽기 어렵다면 아래 목록에서 업체를 선택하고 기기번호를 입력해 주세요.'}</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}
