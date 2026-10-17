import { Camera, ImagePlus, LoaderCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useId, useRef } from 'react';
import { Button } from '../../components/ui';
import type { PhotoEvidenceController } from './usePhotoEvidence';
import { MAX_PHOTOS, PHOTO_ACCEPT } from './validation';
import './PhotoCapture.css';

export function PhotoCapture({ evidence }: { evidence: PhotoEvidenceController }) {
  const { photos, busy, error, add, replace, remove } = evidence;
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLInputElement>(null);
  const replacementId = useRef<string | null>(null);
  const descriptionId = useId();
  const full = photos.length >= MAX_PHOTOS;

  return <section className="photo-capture" aria-label="신고 현장 사진" aria-busy={busy}>
    <p className="field-hint" id={descriptionId}>현장 사진을 1~3장 첨부해 주세요. JPG·PNG·WebP, 한 장당 10MB 이하. 업로드에 맞게 사진 용량을 줄입니다.</p>
    <input ref={galleryInput} className="sr-only" tabIndex={-1} type="file" accept={PHOTO_ACCEPT} multiple aria-label="갤러리 사진 선택" disabled={busy || full} onChange={event => {
      const files = Array.from(event.currentTarget.files || []);
      event.currentTarget.value = '';
      void add(files);
    }} />
    <input ref={cameraInput} className="sr-only" tabIndex={-1} type="file" accept={PHOTO_ACCEPT} capture="environment" aria-label="현장 사진 촬영" disabled={busy || full} onChange={event => {
      const files = Array.from(event.currentTarget.files || []);
      event.currentTarget.value = '';
      void add(files);
    }} />
    <input ref={replacementInput} className="sr-only" tabIndex={-1} type="file" accept={PHOTO_ACCEPT} capture="environment" aria-label="현장 사진 다시 촬영" disabled={busy} onChange={event => {
      const file = event.currentTarget.files?.[0];
      const id = replacementId.current;
      event.currentTarget.value = '';
      replacementId.current = null;
      if (file && id) void replace(id, file);
    }} />
    {photos.length === 0 ? <div className="photo-preview"><Camera size={42} aria-hidden="true" /><strong>킥보드와 주변 상황을 함께 담아주세요</strong><p>통행을 방해하는 위치가 보이도록 촬영해 주세요.</p></div>
      : <ol className="photo-grid" aria-label="첨부한 사진">{photos.map((photo, index) => <li className="photo-item" key={photo.id}>
        <img src={photo.previewUrl} alt={`첨부한 현장 사진 ${index + 1}`} />
        <div className="photo-item-caption"><strong>사진 {index + 1}</strong><span>{(photo.file.size / 1024 / 1024).toFixed(1)}MB</span></div>
        <div className="photo-item-actions"><Button variant="quiet" disabled={busy} aria-label={`사진 ${index + 1} 다시 촬영`} onClick={() => { replacementId.current = photo.id; replacementInput.current?.click(); }}><RotateCcw size={15} aria-hidden="true" />다시 촬영</Button><Button variant="quiet" disabled={busy} aria-label={`사진 ${index + 1} 삭제`} onClick={() => remove(photo.id)}><Trash2 size={15} aria-hidden="true" />삭제</Button></div>
      </li>)}</ol>}
    <div className="capture-actions"><Button disabled={busy || full} onClick={() => cameraInput.current?.click()} aria-describedby={descriptionId}><Camera size={18} aria-hidden="true" />사진 촬영</Button><Button variant="secondary" disabled={busy || full} onClick={() => galleryInput.current?.click()} aria-describedby={descriptionId}><ImagePlus size={18} aria-hidden="true" />갤러리에서 선택</Button></div>
    <p className="field-hint" role="status">{busy ? <><LoaderCircle size={15} className="spin" aria-hidden="true" /> 업로드에 맞게 사진 용량을 줄이고 있어요…</> : `${photos.length}/${MAX_PHOTOS}장 첨부${full ? ' · 다른 사진으로 바꾸려면 다시 촬영하거나 삭제해 주세요.' : ''}`}</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <p className="field-hint">제출 전 사진은 현재 화면에만 보관돼요. 새로고침하거나 신고 화면을 나가면 사라집니다.</p>
  </section>;
}
