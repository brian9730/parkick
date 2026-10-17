import { CheckCheck, RefreshCw, Truck, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import type { AdminCompletionMethod, AdminReportDetail, RelatedReportStatusUpdate } from '../../api/admin';
import { ApiError } from '../../api/client';
import { Button, FormField, LoadingState, StatusBadge } from '../../components/ui';
import { useAuth } from './auth-context';
import { adminCompletionLabel, formatAdminDate } from './report-display';
import { useAdminData } from './useAdminData';

export function RelatedReportsPanel({ report, disabled, onCompleted, onReload, onBusyChange }: {
  report: AdminReportDetail;
  disabled: boolean;
  onCompleted: (count: number, method: AdminCompletionMethod) => void;
  onReload: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const loader = useCallback((signal: AbortSignal) => adminApi.relatedReports(report.publicId, signal), [report.publicId]);
  const { data, loading, error: loadError, reload } = useAdminData(loader);
  const { refresh } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [publicNote, setPublicNote] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [confirmation, setConfirmation] = useState<RelatedReportStatusUpdate | null>(null);
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

  const refreshCandidates = () => {
    if (pending.current || disabled) return;
    setSelected([]); setConfirmation(null); setError('');
    if (conflict || data?.reason === 'ANCHOR_COMPLETED') { onReload(); return; }
    reload();
  };
  const candidates = data?.items ?? [];
  const selectedCandidates = candidates.filter(candidate => selected.includes(candidate.publicId));
  const selectionLimit = data?.criteria.maxSelection ?? 100;
  const unavailable = disabled || saving || conflict || loading || !!loadError || !data?.eligible;
  const prepare = (completionMethod: AdminCompletionMethod) => {
    if (unavailable || !selectedCandidates.length || selectedCandidates.length + 1 > selectionLimit) return;
    setError('');
    setConfirmation({
      status: 'COMPLETED', completionMethod,
      reports: [{ publicId: report.publicId, expectedUpdatedAt: report.updatedAt }, ...selectedCandidates.map(candidate => ({ publicId: candidate.publicId, expectedUpdatedAt: candidate.updatedAt }))],
      publicNote: publicNote.trim(), internalNote: internalNote.trim(),
    });
  };
  const save = async () => {
    if (!confirmation || pending.current) return;
    const update = confirmation;
    pending.current = true; setSaving(true); onBusyChange(true);
    try {
      const result = await adminApi.updateRelatedReports(report.publicId, update);
      if (mounted.current) onCompleted(result.items.length, update.completionMethod);
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status === 401) await refresh();
      if (!mounted.current) return;
      const stale = failure instanceof ApiError && failure.status === 409;
      setConflict(stale);
      if (stale) setSelected([]);
      setError(stale
        ? '신고 상태 또는 함께 처리할 수 있는 조건이 변경되어 저장하지 않았습니다. 최신 상태를 불러온 뒤 다시 선택해 주세요.'
        : failure instanceof Error ? failure.message : '함께 처리 결과를 확인하지 못했습니다. 내용을 유지한 채 다시 시도하거나 최신 상태를 확인해 주세요.');
      setConfirmation(null);
    } finally {
      pending.current = false; onBusyChange(false);
      if (mounted.current) setSaving(false);
    }
  };

  return <section className="dashboard-panel admin-related-panel" aria-labelledby="related-reports-heading" aria-busy={loading || saving}>
    <div className="panel-heading"><div><h2 id="related-reports-heading">같은 기기 신고 함께 처리</h2><p>같은 업체·기기번호로 접수된 가까운 신고를 확인합니다. 같은 방치 건인지 사진과 내용을 확인한 뒤 직접 선택하세요.</p></div></div>
    <p className="field-hint">현재 신고와 같은 관리 기관·지역에서 100m 이내, 접수 시각 차이 24시간 이내인 미완료 신고가 후보입니다. 처리 완료를 사이에 둔 새 신고는 제외합니다.</p>
    <div className="admin-related-toolbar"><Button variant="secondary" disabled={disabled || saving || loading} onClick={refreshCandidates}><RefreshCw size={15} />{conflict ? '최신 상태 불러오기' : '후보 다시 조회'}</Button></div>
    {loading ? <LoadingState label="함께 처리할 신고를 확인하고 있습니다" />
      : loadError ? <p className="admin-action-error" role="alert">{loadError} 현재 신고는 개별 처리할 수 있습니다.</p>
        : data && !data.eligible ? <p className="field-hint">{data.reason === 'IDENTITY_UNKNOWN'
          ? '확인된 업체와 기기번호가 모두 있어야 함께 처리할 신고를 찾을 수 있습니다. 현재 신고는 개별 처리해 주세요.'
          : data.reason === 'ANCHOR_COMPLETED' ? '현재 신고가 이미 완료되었습니다. 최신 상태를 불러와 주세요.'
            : '후보가 많아 함께 처리할 대상을 안전하게 확인할 수 없습니다. 신고를 개별 확인해 주세요.'}</p>
          : data && candidates.length === 0 ? <p className="field-hint">현재 함께 처리할 수 있는 신고가 없습니다.</p>
            : data && <>
              {data.truncated && <p className="inline-notice">후보가 많아 일부만 표시합니다. 현재 표시된 신고에서 선택해 최대 {selectionLimit}건까지 함께 처리할 수 있습니다.</p>}
              <div className="admin-related-anchor"><strong>현재 신고 · 항상 포함</strong><span className="admin-report-id">{report.publicId}</span><span>{report.operatorName} · {report.deviceId}</span><time dateTime={report.createdAt}>{formatAdminDate(report.createdAt)}</time></div>
              <ul className="admin-related-list">{candidates.map(candidate => <li key={candidate.publicId}>
                <label className="admin-related-select"><input type="checkbox" checked={selected.includes(candidate.publicId)} disabled={unavailable || (!selected.includes(candidate.publicId) && selectedCandidates.length + 1 >= selectionLimit)}
                  aria-label={`${candidate.publicId} 함께 처리 선택`} onChange={event => setSelected(previous => event.target.checked ? [...previous, candidate.publicId] : previous.filter(id => id !== candidate.publicId))} /><span>함께 처리</span></label>
                <div className="admin-related-summary"><Link className="admin-report-id" target="_blank" rel="noopener noreferrer" to={`/admin/reports/${encodeURIComponent(candidate.publicId)}`} aria-label={`${candidate.publicId} 신고 상세 새 창에서 보기`}>{candidate.publicId}</Link><div className="admin-report-status"><StatusBadge status={candidate.status} /><span>{candidate.operatorName} · {candidate.deviceId}</span></div><p>{candidate.address || '주소 미입력'} <strong>· 약 {Math.round(candidate.distanceMeters)}m</strong></p><time dateTime={candidate.createdAt}>{formatAdminDate(candidate.createdAt)}</time></div>
              </li>)}</ul>
              <p className="admin-related-count" role="status">추가 신고 {selectedCandidates.length}건 선택 · 현재 신고 포함 {selectedCandidates.length + 1}건</p>
              <p className="field-hint">선택한 신고만 같은 조치 결과로 완료합니다. 각 접수번호와 신고 내역은 그대로 유지되며, 최대 {selectionLimit}건을 함께 처리할 수 있습니다.</p>
              <FormField label="함께 처리할 공개 메모" htmlFor="related-public-note" hint="선택한 각 신고의 시민 조회에 표시됩니다. 선택 입력, 최대 1,000자."><textarea id="related-public-note" rows={2} maxLength={1000} disabled={unavailable} value={publicNote} onChange={event => setPublicNote(event.target.value)} aria-describedby="related-public-note-hint" /></FormField>
              <FormField label="함께 처리할 내부 메모" htmlFor="related-internal-note" hint="선택한 각 신고의 관리자 처리 이력에만 표시됩니다. 선택 입력, 최대 1,000자."><textarea id="related-internal-note" rows={2} maxLength={1000} disabled={unavailable} value={internalNote} onChange={event => setInternalNote(event.target.value)} aria-describedby="related-internal-note-hint" /></FormField>
              <div className="admin-status-actions"><Button disabled={unavailable || !selectedCandidates.length} onClick={() => prepare('COLLECTED')}><CheckCheck size={17} />선택 신고 함께 수거 완료</Button><Button variant="secondary" disabled={unavailable || !selectedCandidates.length} onClick={() => prepare('TOWED')}><Truck size={17} />선택 신고 함께 견인 완료</Button></div>
            </>}
    {error && <div className="admin-action-error" role="alert"><p>{error}</p></div>}
    <dialog ref={dialog} className="admin-confirm-dialog admin-related-confirm" aria-labelledby="related-confirm-heading" aria-describedby="related-confirm-description" onCancel={event => { event.preventDefault(); if (!saving) setConfirmation(null); }}>
      {confirmation && <>
        <div className="admin-confirm-heading"><h2 id="related-confirm-heading">신고 {confirmation.reports.length}건 함께 처리 확인</h2><button type="button" className="icon-button" aria-label="함께 처리 확인 창 닫기" disabled={saving} onClick={() => setConfirmation(null)}><X size={20} /></button></div>
        <p id="related-confirm-description">아래 신고가 같은 방치 건임을 확인했으며, 모두 <strong>{adminCompletionLabel(confirmation.completionMethod)}</strong>로 저장합니다. 완료 후에는 수정할 수 없습니다.</p>
        <ul className="admin-related-confirm-ids">{confirmation.reports.map(item => <li key={item.publicId}><span className="admin-report-id">{item.publicId}</span>{item.publicId === report.publicId && <small>현재 신고</small>}</li>)}</ul>
        <dl className="admin-confirm-notes"><div><dt>공개 처리 메모</dt><dd>{confirmation.publicNote || '없음'}</dd></div><div><dt>내부 메모</dt><dd>{confirmation.internalNote || '없음'}</dd></div></dl>
        <p className="field-hint">하나라도 상태나 대상 조건이 바뀌면 전체 저장을 취소합니다. 신고 내역을 합치거나 삭제하지 않습니다.</p>
        <div className="admin-confirm-actions"><Button variant="secondary" disabled={saving} onClick={() => setConfirmation(null)}>취소</Button><Button disabled={saving} onClick={() => void save()}>{saving ? '저장 중…' : `${confirmation.reports.length}건 완료 확인`}</Button></div>
      </>}
    </dialog>
  </section>;
}
