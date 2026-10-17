import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { UploadProgress } from '../../api/client';
import './submission.css';

/** A native modal makes the page (including header navigation) inert during upload. */
export function SubmissionProgress({ active, progress }: { active: boolean; progress: UploadProgress | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const processing = progress?.phase === 'processing';
  const percent = progress?.total ? Math.min(100, Math.floor(progress.loaded / progress.total * 100)) : null;
  const uploaded = progress ? (progress.loaded / (1024 * 1024)).toFixed(1) : '0.0';
  const total = progress?.total ? (progress.total / (1024 * 1024)).toFixed(1) : null;
  useEffect(() => {
    if (!active) return;
    const element = dialog.current;
    element?.showModal();
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => { element?.close(); window.removeEventListener('beforeunload', warnBeforeLeaving); };
  }, [active]);
  return <dialog ref={dialog} className="submission-progress" aria-labelledby="submission-progress-title" aria-describedby="submission-progress-description" onCancel={event => event.preventDefault()}>
    <LoaderCircle className="spin" size={30} aria-hidden="true" />
    <h2 id="submission-progress-title">신고를 제출하고 있어요</h2>
    <p id="submission-progress-description" role="status">{processing ? '사진 전송을 마쳤어요. 서버에서 사진과 신고 내용을 확인하고 접수하고 있어요.' : '사진과 신고 내용을 보내고 있어요. 연결 속도에 따라 몇 분 정도 걸릴 수 있어요.'}</p>
    <div className="submission-upload-progress">
      {processing ? <p>접수번호를 확인하고 있어요…</p> : <>
        <progress max={100} value={percent ?? undefined} aria-label="사진과 신고 내용 전송 진행률" />
        <p>{percent === null ? `${uploaded}MB 전송됨` : `${percent}% · ${uploaded} / ${total}MB 전송됨`}</p>
      </>}
    </div>
    <p className="submission-wait-hint">접수 완료 화면이 나올 때까지 이 화면을 유지해 주세요.</p>
  </dialog>;
}
