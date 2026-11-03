import { Camera, ImagePlus, LoaderCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { LivePhotoCamera } from './LivePhotoCamera';
import type { PhotoEvidenceController } from './usePhotoEvidence';
import { MAX_PHOTOS, PHOTO_ACCEPT } from './validation';
import type { ReportServiceStatus } from '../../api/reports';
import './PhotoCapture.css';

export function PhotoCapture({ evidence, validationBusy = false, validationMode, onCameraActiveChange }: {
  evidence: PhotoEvidenceController;
  validationBusy?: boolean;
  validationMode?: ReportServiceStatus['photoValidation'];
  onCameraActiveChange: (active: boolean) => void;
}) {
  const { photos, busy, error, add, replace, remove } = evidence;
  const locked = busy || validationBusy;
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLInputElement>(null);
  const replacementId = useRef<string | null>(null);
  const [cameraSession, setCameraSession] = useState<{ replacementId: string | null } | null>(null);
  const guidanceId = useId();
  const full = photos.length >= MAX_PHOTOS;

  const closeCamera = useCallback(() => {
    setCameraSession(null);
    onCameraActiveChange(false);
  }, [onCameraActiveChange]);
  const openNativeCamera = (id: string | null) => {
    if (id) {
      replacementId.current = id;
      replacementInput.current?.click();
    } else {
      cameraInput.current?.click();
    }
  };
  const startCamera = (id: string | null) => {
    if (!navigator.mediaDevices?.getUserMedia || (validationMode !== 'bedrock' && validationMode !== 'litellm')) {
      openNativeCamera(id);
      return;
    }
    setCameraSession({ replacementId: id });
    onCameraActiveChange(true);
  };

  return <section className="photo-capture" aria-label="신고 현장 사진" aria-busy={locked}>
    <div className="photo-guidance" id={guidanceId}>
      <strong>현장사진을 촬영해 주세요.</strong>
      <ul>
        <li>신고 대상 기기가 화면 안에서 충분히 크게, 전체가 잘리지 않게 촬영해 주세요.</li>
        <li>행인 얼굴이나 제3자 차량번호판 등 개인정보가 찍히지 않도록 주의해 주세요.</li>
      </ul>
    </div>
    {(validationMode === 'bedrock' || validationMode === 'litellm') && <p className="photo-live-preflight">실시간 안내 촬영 시 축소한 카메라 화면을 AI로 전송합니다. 안내 프레임은 신고 사진으로 저장하지 않습니다.</p>}
    <input ref={galleryInput} className="sr-only" tabIndex={-1} type="file" accept={PHOTO_ACCEPT} multiple aria-label="갤러리 사진 선택" disabled={locked || full} onChange={event => {
      const files = Array.from(event.currentTarget.files || []);
      event.currentTarget.value = '';
      void add(files);
    }} />
    <input ref={cameraInput} className="sr-only" tabIndex={-1} type="file" accept={PHOTO_ACCEPT} capture="environment" aria-label="현장 사진 촬영" disabled={locked || full} onChange={event => {
      const files = Array.from(event.currentTarget.files || []);
      event.currentTarget.value = '';
      void add(files);
    }} />
    <input ref={replacementInput} className="sr-only" tabIndex={-1} type="file" accept={PHOTO_ACCEPT} capture="environment" aria-label="현장 사진 다시 촬영" disabled={locked} onChange={event => {
      const file = event.currentTarget.files?.[0];
      const id = replacementId.current;
      event.currentTarget.value = '';
      replacementId.current = null;
      if (file && id) void replace(id, file);
    }} />
    {cameraSession && <LivePhotoCamera onClose={closeCamera} onNativeCapture={() => { const id = cameraSession.replacementId; closeCamera(); openNativeCamera(id); }} onCapture={file => {
      const id = cameraSession.replacementId;
      closeCamera();
      if (id) void replace(id, file);
      else void add([file]);
    }} />}
    {photos.length === 0 ? <div className="photo-preview"><Camera size={32} aria-hidden="true" /><strong>사진을 추가해 주세요</strong></div>
      : <ol className="photo-grid" aria-label="첨부한 사진">{photos.map((photo, index) => <li className="photo-item" key={photo.id}>
        <img src={photo.previewUrl} alt={`첨부한 현장 사진 ${index + 1}`} />
        <div className="photo-item-caption"><strong>사진 {index + 1}</strong><span>{(photo.file.size / 1024 / 1024).toFixed(1)}MB</span></div>
        <div className="photo-item-actions"><Button variant="quiet" disabled={locked || !!cameraSession} aria-label={`사진 ${index + 1} 다시 촬영`} onClick={() => startCamera(photo.id)}><RotateCcw size={15} aria-hidden="true" />다시 촬영</Button><Button variant="quiet" disabled={locked || !!cameraSession} aria-label={`사진 ${index + 1} 삭제`} onClick={() => remove(photo.id)}><Trash2 size={15} aria-hidden="true" />삭제</Button></div>
      </li>)}</ol>}
    <div className="capture-actions"><Button disabled={locked || full || !!cameraSession} onClick={() => startCamera(null)} aria-describedby={guidanceId}><Camera size={18} aria-hidden="true" />{validationMode === 'bedrock' || validationMode === 'litellm' ? '실시간 안내 촬영' : '사진 촬영'}</Button><Button variant="secondary" disabled={locked || full || !!cameraSession} onClick={() => galleryInput.current?.click()} aria-describedby={guidanceId}><ImagePlus size={18} aria-hidden="true" />갤러리에서 선택</Button></div>
    <p className="field-hint" role="status">{validationBusy ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> {validationMode === 'bedrock' || validationMode === 'litellm' ? '사진에 공유 킥보드 또는 자전거가 보이는지 확인하고 있어요…' : validationMode === 'mock' ? '개발용 모의 검사를 진행하고 있어요…' : '사진 파일 형식을 확인하고 있어요…'}</> : busy ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> 업로드에 맞게 사진 용량을 줄이고 있어요…</> : `${photos.length}/${MAX_PHOTOS}장 첨부${full ? ' · 다른 사진으로 바꾸려면 다시 촬영하거나 삭제해 주세요.' : ''}`}</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}
