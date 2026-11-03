import { Ban, CheckCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../../api/admin';
import type { AdminReportDetail, ReportStatusUpdate } from '../../api/admin';
import { ApiError } from '../../api/client';
import { Button, FormField } from '../../components/ui';
import { useAuth } from './auth-context';
import { adminCompletionLabel, formatAdminDate } from './report-display';

type Action = 'REJECTED' | 'COLLECTED';
const actionLabel = (action: Action) => action === 'REJECTED' ? '반려' : adminCompletionLabel(action);
interface Confirmation { action: Action; update: ReportStatusUpdate }

export function ReportStatusForm({ report, onUpdated, onReload, onBusyChange }: {
  report: AdminReportDetail;
  onUpdated: (report: AdminReportDetail) => void;
  onReload: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { refresh } = useAuth();
  const [publicNote, setPublicNote] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);

  const prepare = (action: Action) => {
    setError('');
    setConfirmation({ action, update: {
      status: action === 'REJECTED' ? 'REJECTED' : 'COMPLETED',
      ...(action === 'REJECTED' ? {} : { completionMethod: action }),
      publicNote: publicNote.trim(), internalNote: internalNote.trim(), expectedUpdatedAt: report.updatedAt,
    } });
  };
  const save = async () => {
    if (!confirmation || pending.current) return;
    pending.current = true;
    setSaving(true);
    onBusyChange(true);
    try {
      const result = await adminApi.updateReport(report.publicId, confirmation.update);
      if (mounted.current) onUpdated(result);
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status === 401) await refresh();
      if (!mounted.current) return;
      const isConflict = failure instanceof ApiError && failure.status === 409;
      setConflict(isConflict);
      setError(isConflict ? '신고 상태가 변경되었습니다. 최신 상태를 불러온 뒤 다시 확인해 주세요.' : failure instanceof Error ? failure.message : '처리 상태를 저장하지 못했습니다. 다시 시도해 주세요.');
      setConfirmation(null);
    } finally {
      pending.current = false;
      onBusyChange(false);
      if (mounted.current) setSaving(false);
    }
  };

  if (report.status === 'COMPLETED' || report.status === 'REJECTED') return <section className={`dashboard-panel admin-completed-panel ${report.status === 'REJECTED' ? 'admin-rejected-panel' : ''}`} aria-labelledby="report-actions-heading">
    {report.status === 'REJECTED' ? <Ban size={26} /> : <CheckCheck size={26} />}
    <h2 id="report-actions-heading">{report.status === 'REJECTED' ? '반려' : adminCompletionLabel(report.completionMethod) || '처리 완료'}</h2>
    {report.completedAt && <p><time dateTime={report.completedAt}>{formatAdminDate(report.completedAt)}</time>에 완료했습니다.</p>}
    <p>{report.status === 'REJECTED' ? '반려된 신고는 상태를 다시 변경할 수 없습니다.' : '완료된 신고는 상태를 다시 변경할 수 없습니다.'}</p>
  </section>;

  const actions = <div className="admin-status-actions">
    {(report.status === 'RECEIVED' || report.status === 'PROCESSING') && <Button variant="secondary" disabled={saving || conflict} onClick={() => prepare('REJECTED')}><Ban size={17} />반려</Button>}
    <Button disabled={saving || conflict} onClick={() => prepare('COLLECTED')}><CheckCheck size={17} />수거 완료</Button>
  </div>;
  const feedback = error && <div className="admin-action-error" role="alert"><p>{error}</p>{conflict && <Button variant="secondary" onClick={onReload}>최신 상태 불러오기</Button>}</div>;

  return <section className="dashboard-panel admin-status-form" aria-labelledby="report-actions-heading">
    <div className="panel-heading"><div><h2 id="report-actions-heading">처리 상태 변경</h2><p>신고를 반려하거나 현장 수거 결과를 저장하세요. 저장 후에는 상태를 다시 변경할 수 없습니다.</p></div></div>
    <FormField label="공개 처리 메모" htmlFor="admin-public-note" hint="전화번호로 조회하는 시민에게 표시됩니다. 선택 입력, 최대 1,000자."><textarea id="admin-public-note" rows={3} maxLength={1000} disabled={saving || conflict} value={publicNote} onChange={event => { setPublicNote(event.target.value); if (error) setError(''); }} aria-describedby="admin-public-note-hint" placeholder="예: 보행에 방해되지 않도록 수거했습니다." /></FormField>
    <FormField label="내부 메모" htmlFor="admin-internal-note" hint="관리자만 확인합니다. 시민 조회에는 표시되지 않습니다. 선택 입력, 최대 1,000자."><textarea id="admin-internal-note" rows={3} maxLength={1000} disabled={saving || conflict} value={internalNote} onChange={event => setInternalNote(event.target.value)} aria-describedby="admin-internal-note-hint" /></FormField>
    {feedback}
    {actions}
    <dialog ref={dialog} className="admin-confirm-dialog" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-description" onCancel={event => { event.preventDefault(); if (!saving) setConfirmation(null); }}>
      {confirmation && <>
        <div className="admin-confirm-heading"><h2 id="admin-confirm-title">처리 상태 변경 확인</h2><button className="icon-button" type="button" disabled={saving} onClick={() => setConfirmation(null)} aria-label="확인 창 닫기"><X size={20} /></button></div>
        <p className="admin-report-id">{report.publicId}</p>
        <p id="admin-confirm-description"><strong>{actionLabel(confirmation.action)}</strong> 상태로 저장합니다. 저장 후에는 상태를 다시 변경할 수 없습니다.{confirmation.action === 'REJECTED' && ' 공개 처리 메모를 입력했다면 시민의 신고 조회 화면에 표시됩니다.'}</p>
        <dl className="admin-confirm-notes"><div><dt>공개 처리 메모</dt><dd>{confirmation.update.publicNote || '없음'}</dd></div><div><dt>내부 메모</dt><dd>{confirmation.update.internalNote || '없음'}</dd></div></dl>
        <div className="admin-confirm-actions"><Button variant="secondary" disabled={saving} onClick={() => setConfirmation(null)}>취소</Button><Button disabled={saving} onClick={() => void save()}>{saving ? '저장 중…' : '변경 확인'}</Button></div>
      </>}
    </dialog>
  </section>;
}
