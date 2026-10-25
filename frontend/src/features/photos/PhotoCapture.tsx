import { Camera, ImagePlus, LoaderCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useId, useRef } from 'react';
import { Button } from '../../components/ui';
import type { PhotoEvidenceController } from './usePhotoEvidence';
import { MAX_PHOTOS, PHOTO_ACCEPT } from './validation';
import type { ReportServiceStatus } from '../../api/reports';
import './PhotoCapture.css';

export function PhotoCapture({ evidence, validationBusy = false, validationMode }: {
  evidence: PhotoEvidenceController;
  validationBusy?: boolean;
  validationMode?: ReportServiceStatus['photoValidation'];
}) {
  const { photos, busy, error, add, replace, remove } = evidence;
  const locked = busy || validationBusy;
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLInputElement>(null);
  const replacementId = useRef<string | null>(null);
  const guidanceId = useId();
  const full = photos.length >= MAX_PHOTOS;

  return <section className="photo-capture" aria-label="신고 현장 사진" aria-busy={locked}>
    <div className="photo-guidance" id={guidanceId}>
      <strong>현장사진을 촬영해 주세요.</strong>
      <ul>
        <li>3미터 떨어진 위치에서 신고 대상 기기 전체가 보이도록 촬영해 주세요.</li>
        <li>행인 얼굴이나 제3자 차량번호판 등 개인정보가 찍히지 않도록 주의해 주세요.</li>
      </ul>
    </div>
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
    {photos.length === 0 ? <div className="photo-preview"><Camera size={32} aria-hidden="true" /><strong>사진을 추가해 주세요</strong></div>
      : <ol className="photo-grid" aria-label="첨부한 사진">{photos.map((photo, index) => <li className="photo-item" key={photo.id}>
        <img src={photo.previewUrl} alt={`첨부한 현장 사진 ${index + 1}`} />
        <div className="photo-item-caption"><strong>사진 {index + 1}</strong><span>{(photo.file.size / 1024 / 1024).toFixed(1)}MB</span></div>
        <div className="photo-item-actions"><Button variant="quiet" disabled={locked} aria-label={`사진 ${index + 1} 다시 촬영`} onClick={() => { replacementId.current = photo.id; replacementInput.current?.click(); }}><RotateCcw size={15} aria-hidden="true" />다시 촬영</Button><Button variant="quiet" disabled={locked} aria-label={`사진 ${index + 1} 삭제`} onClick={() => remove(photo.id)}><Trash2 size={15} aria-hidden="true" />삭제</Button></div>
      </li>)}</ol>}
    <div className="capture-actions"><Button disabled={locked || full} onClick={() => cameraInput.current?.click()} aria-describedby={guidanceId}><Camera size={18} aria-hidden="true" />사진 촬영</Button><Button variant="secondary" disabled={locked || full} onClick={() => galleryInput.current?.click()} aria-describedby={guidanceId}><ImagePlus size={18} aria-hidden="true" />갤러리에서 선택</Button></div>
    <p className="field-hint" role="status">{validationBusy ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> {validationMode === 'bedrock' || validationMode === 'litellm' ? '사진에 공유 킥보드 또는 자전거가 보이는지 확인하고 있어요…' : validationMode === 'mock' ? '개발용 모의 검사를 진행하고 있어요…' : '사진 파일 형식을 확인하고 있어요…'}</> : busy ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> 업로드에 맞게 사진 용량을 줄이고 있어요…</> : `${photos.length}/${MAX_PHOTOS}장 첨부${full ? ' · 다른 사진으로 바꾸려면 다시 촬영하거나 삭제해 주세요.' : ''}`}</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}
