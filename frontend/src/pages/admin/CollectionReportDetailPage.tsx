import { ArrowLeft, Ban, Camera, CheckCheck, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { collectionApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import { DashboardPanel } from '../../components/AdminCards';
import { Button, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { CollectionQrCompare } from '../../features/admin/CollectionQrCompare';
import { useAuth } from '../../features/admin/auth-context';
import { NaverRouteButtons } from '../../features/admin/NaverRouteButtons';
import { adminCompletionLabel, formatAdminDate } from '../../features/admin/report-display';
import { useAdminData } from '../../features/admin/useAdminData';
import './CollectionReportDetailPage.css';

function collectionReturnUrl(state: unknown, search: string): string {
  const fromState = state && typeof state === 'object' && 'collectionReturnTo' in state ? state.collectionReturnTo : null;
  for (const value of [fromState, new URLSearchParams(search).get('returnTo')]) {
    if (typeof value !== 'string') continue;
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin === window.location.origin && url.pathname === '/collect') return `${url.pathname}${url.search}`;
    } catch { /* Ignore malformed return URLs. */ }
  }
  return '/collect';
}

function CollectionPhoto({ publicId, imageId, index }: { publicId: string; imageId: string; index: number }) {
  const [failed, setFailed] = useState(false);
  const source = `/api/admin/collection/reports/${encodeURIComponent(publicId)}/images/${encodeURIComponent(imageId)}`;
  return <figure className="admin-report-photo">{failed
    ? <div className="admin-photo-error"><Camera size={25} /><p>사진을 불러오지 못했습니다.<br />페이지를 새로고침해 주세요.</p></div>
    : <a href={source} target="_blank" rel="noopener noreferrer" aria-label={`현장사진 ${index + 1} 크게 보기`}><img src={source} alt={`신고 현장사진 ${index + 1}`} loading="lazy" onError={() => setFailed(true)} /></a>}
    <figcaption>현장사진 {index + 1}</figcaption>
  </figure>;
}

type CollectionAction = 'complete' | 'missing';

export function CollectionReportDetailPage() {
  const { publicId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const returnTo = collectionReturnUrl(location.state, location.search);
  const loader = useCallback((signal: AbortSignal) => collectionApi.report(publicId, signal), [publicId]);
  const { data: report, loading, error, reload } = useAdminData(loader);
  const [note, setNote] = useState('');
  const [confirmation, setConfirmation] = useState<CollectionAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [conflict, setConflict] = useState(false);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const prepare = (action: CollectionAction) => {
    if (!report || saving || report.hasPendingFieldFinding) return;
    setActionError('');
    if (action === 'missing' && !note.trim()) {
      setActionError('현장에서 확인한 내용을 입력해 주세요. 관리자가 최종 처리할 때 참고합니다.');
      noteInput.current?.focus();
      return;
    }
    setConfirmation(action);
  };

  const save = async () => {
    if (!report || !confirmation || pending.current) return;
    pending.current = true;
    setSaving(true);
    setActionError('');
    try {
      if (confirmation === 'complete') {
        await collectionApi.complete(report.publicId, report.updatedAt);
        void navigate(returnTo, { replace: true, state: { collectionStatusMessage: '수거 완료로 저장했습니다. 다음 대상을 확인하세요.' } });
      } else {
        await collectionApi.missing(report.publicId, report.updatedAt, note.trim());
        void navigate(returnTo, { replace: true, state: { collectionStatusMessage: '현장에 기기 없음으로 기록했습니다. 관리자가 확인 후 최종 반려합니다.' } });
      }
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status === 401) await refresh();
      if (!mounted.current) return;
      const isConflict = failure instanceof ApiError && failure.status === 409;
      setConflict(isConflict);
      setActionError(isConflict ? '다른 담당자가 이 신고를 변경했습니다. 최신 상태를 불러온 뒤 다시 확인해 주세요.' : failure instanceof Error ? failure.message : '현장 처리 결과를 저장하지 못했습니다. 다시 시도해 주세요.');
      setConfirmation(null);
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const open = report && report.status !== 'COMPLETED' && report.status !== 'REJECTED';
  const missingFinding = report?.fieldFindings?.find(finding => finding.status === 'PENDING_REVIEW');

  return <div className="collection-detail-page">
    <Link className="back-link" to={returnTo}><ArrowLeft size={16} />수거 목록으로</Link>
    <div className="admin-page-heading collection-detail-heading"><div><h1>현장 신고 확인</h1><p className="admin-report-id">{publicId}</p></div><Button variant="secondary" disabled={loading || saving} onClick={() => { setActionError(''); setConflict(false); reload(); }}><RefreshCw size={16} />새로고침</Button></div>
    {loading ? <LoadingState label="신고 상세를 불러오고 있습니다" /> : error ? <ErrorState message={error} onRetry={reload} /> : report && <div className="admin-detail-grid collection-detail-grid">
      <div className="admin-detail-main">
        <DashboardPanel title="현장 확인" className="admin-detail-summary">
          <div className="admin-report-status admin-detail-status"><StatusBadge status={report.status} />{report.completionMethod && <strong>{adminCompletionLabel(report.completionMethod)}</strong>}</div>
          <dl className="admin-report-metadata">
            <div><dt>운영업체</dt><dd>{report.operatorName || '확인되지 않음'}</dd></div>
            <div><dt>기기번호</dt><dd>{report.deviceId || '확인되지 않음'}</dd></div>
            <div className="admin-metadata-wide"><dt>신고 위치</dt><dd>{report.address || '주소 미입력'}</dd></div>
            <div><dt>접수 일시</dt><dd><time dateTime={report.createdAt}>{formatAdminDate(report.createdAt)}</time></dd></div>
            <div><dt>신고 유형</dt><dd><div className="admin-report-tags">{report.categories.map(category => <span key={category}>{category}</span>)}</div></dd></div>
          </dl>
          <NaverRouteButtons latitude={report.latitude} longitude={report.longitude} destinationName={report.address || `${report.operatorName || '공유 PM'} ${report.deviceId || ''}`} />
        </DashboardPanel>
        <DashboardPanel title="현장사진" className="admin-detail-photos"><div className="admin-report-photos">{report.images.map((image, index) => <CollectionPhoto key={image.id} publicId={report.publicId} imageId={image.id} index={index} />)}</div>{!report.images.length && <p className="field-hint">등록된 사진이 없습니다.</p>}</DashboardPanel>
        {open && !report.hasPendingFieldFinding && <CollectionQrCompare report={report} />}
        {open && report.hasPendingFieldFinding && <section className="dashboard-panel collection-pending-review" role="status"><h2>관리자 검토 대기</h2><p>현장에 기기가 없다는 기록이 접수되었습니다. 관리자가 확인 후 최종 처리합니다.</p>{missingFinding && <><p className="collection-pending-note">{missingFinding.note}</p><small>{formatAdminDate(missingFinding.createdAt)} 기록</small></>}</section>}
      </div>
      <aside className="admin-detail-actions">
        {open && !report.hasPendingFieldFinding ? <section className="dashboard-panel collection-field-actions" aria-labelledby="collection-actions-title">
          <div className="panel-heading"><div><h2 id="collection-actions-title">현장 처리</h2><p>기기를 수거했다면 완료를 기록하세요. 기기가 없다면 관리자에게 현장 상황을 전달합니다.</p></div></div>
          <Button className="collection-complete-button" disabled={saving || conflict} onClick={() => prepare('complete')}><CheckCheck size={19} />수거 완료</Button>
          <label className="collection-note-label" htmlFor="collection-field-note">현장 확인 메모</label>
          <textarea ref={noteInput} id="collection-field-note" rows={3} maxLength={1000} disabled={saving || conflict} value={note} onChange={event => { setNote(event.target.value); setActionError(''); }} placeholder="예: 현장에 도착했으나 신고된 기기를 찾지 못했습니다." />
          <Button variant="secondary" className="collection-missing-button" disabled={saving || conflict} onClick={() => prepare('missing')}><Ban size={17} />현장에 기기 없음 기록</Button>
          <p className="field-hint">기기 없음 기록만으로 신고가 반려되지는 않습니다. 관리자가 검토 후 최종 반려합니다.</p>
          {actionError && <div className="admin-action-error" role="alert"><p>{actionError}</p>{conflict && <Button variant="secondary" onClick={() => { setConflict(false); reload(); }}>최신 상태 불러오기</Button>}</div>}
        </section> : <section className="dashboard-panel collection-field-actions"><h2>{report.hasPendingFieldFinding ? '관리자 검토 대기' : report.status === 'REJECTED' ? '반려' : '처리 완료'}</h2><p>{report.hasPendingFieldFinding ? '관리자가 현장 기록을 확인하고 있습니다.' : '이 신고의 현장 처리가 종료되었습니다.'}</p></section>}
      </aside>
    </div>}
    {confirmation && report && <div className="collection-confirm-backdrop" role="presentation"><div className="collection-confirm" role="dialog" aria-modal="true" aria-labelledby="collection-confirm-title" aria-describedby="collection-confirm-description"><div className="collection-confirm-heading"><h2 id="collection-confirm-title">현장 처리 확인</h2><button type="button" className="icon-button" aria-label="확인 창 닫기" disabled={saving} onClick={() => setConfirmation(null)}><X size={20} /></button></div><p className="admin-report-id">{report.publicId}</p><p id="collection-confirm-description">{confirmation === 'complete' ? '수거 완료로 저장합니다. 저장 후 상태를 변경할 수 없습니다.' : '현장에 기기 없음으로 기록합니다. 관리자가 검토한 뒤 최종 반려합니다.'}</p>{confirmation === 'missing' && <p className="collection-confirm-note">{note.trim()}</p>}<div className="collection-confirm-actions"><Button variant="secondary" disabled={saving} onClick={() => setConfirmation(null)}>취소</Button><Button disabled={saving} onClick={() => void save()}>{saving ? '저장 중…' : '기록 확인'}</Button></div></div></div>}
  </div>;
}
