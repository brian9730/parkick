import { ArrowLeft, Camera, RefreshCw, ScanLine } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import type { AdminReportDetail } from '../../api/admin';
import { parseQr } from '../../api/qr';
import { DashboardPanel } from '../../components/AdminCards';
import { Button, EmptyState, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { useAuth } from '../../features/admin/auth-context';
import { ReportStatusForm } from '../../features/admin/ReportStatusForm';
import { RelatedReportsPanel } from '../../features/admin/RelatedReportsPanel';
import { NaverRouteButtons } from '../../features/admin/NaverRouteButtons';
import { QRScanner } from '../../features/qr/QRScanner';
import { findOperator } from '../../features/report/operators';
import { adminCompletionLabel, adminReportJurisdiction, formatAdminDate } from '../../features/admin/report-display';
import { useAdminData } from '../../features/admin/useAdminData';

function ReportPhoto({ image, publicId, index }: { image: AdminReportDetail['images'][number]; publicId: string; index: number }) {
  const [failed, setFailed] = useState(false);
  // Only the authenticated, same-origin admin image endpoint may be embedded.
  let source = '';
  try {
    const url = new URL(image.url, window.location.origin);
    const expected = `/api/admin/reports/${encodeURIComponent(publicId)}/images/${encodeURIComponent(image.id)}`;
    if (url.origin === window.location.origin && url.pathname === expected && !url.search && !url.hash) source = url.pathname;
  } catch { /* Invalid paths remain unavailable. */ }
  return <figure className="admin-report-photo">{failed || !source
    ? <div className="admin-photo-error"><Camera size={25} /><p>사진을 불러오지 못했습니다.<br />페이지를 새로고침해 주세요.</p></div>
    : <a href={source} target="_blank" rel="noopener noreferrer" aria-label={`현장사진 ${index + 1} 크게 보기`}><img src={source} alt={`신고 현장사진 ${index + 1}`} loading="lazy" onError={() => setFailed(true)} /></a>}
    <figcaption>현장사진 {index + 1}</figcaption>
  </figure>;
}

function CollectionQrCompare({ report }: { report: AdminReportDetail }) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ kind: 'match' | 'mismatch' | 'unknown' | 'error'; message: string } | null>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  const toggle = () => {
    request.current += 1;
    setChecking(false);
    setResult(null);
    setOpen(value => !value);
  };
  const decoded = async (rawQr: string) => {
    const current = ++request.current;
    setResult(null);
    setChecking(true);
    try {
      // Parse without passing the reported operator: an operator selected from
      // the report cannot count as independent QR verification.
      const parsed = await parseQr(rawQr);
      if (current !== request.current) return;
      const recordedOperatorId = findOperator(report.operatorName || '')?.id;
      if (!parsed.matched || !parsed.operatorId || !parsed.deviceId || !recordedOperatorId || !report.deviceId) {
        setResult({ kind: 'unknown', message: 'QR만으로 업체와 기기번호를 모두 비교할 수 없습니다. 기기에 표시된 번호를 직접 확인해 주세요.' });
      } else if (parsed.operatorId === recordedOperatorId && parsed.deviceId.trim().toUpperCase() === report.deviceId.trim().toUpperCase()) {
        setResult({ kind: 'match', message: `QR 정보가 신고 내용과 일치합니다: ${parsed.operatorName || report.operatorName} · ${parsed.deviceId}` });
      } else {
        setResult({ kind: 'mismatch', message: `QR 정보가 신고 내용과 다릅니다. 신고: ${report.operatorName} · ${report.deviceId} / QR: ${parsed.operatorName || '업체 미확인'} · ${parsed.deviceId}. 수거 전 기기를 다시 확인해 주세요.` });
      }
    } catch {
      if (current === request.current) setResult({ kind: 'error', message: 'QR 정보를 확인하지 못했습니다. 기기에 표시된 업체와 번호를 직접 비교해 주세요.' });
    } finally {
      if (current === request.current) setChecking(false);
    }
  };

  return <section className="dashboard-panel admin-detail-qr" aria-label="현장 기기 QR 재확인">
    <button type="button" className="collection-qr-toggle" aria-expanded={open} onClick={toggle}><ScanLine size={18} aria-hidden="true" />기기 QR 재확인 <span>선택</span></button>
    {open && <div className="collection-qr-content"><p>신고된 업체·기기번호와 현장 QR을 비교합니다. 스캔 결과만으로 신고 상태가 바뀌지는 않습니다.</p><QRScanner onDecoded={rawQr => void decoded(rawQr)} disabled={checking} compact idleHint="QR을 읽지 못하면 기기에 표시된 업체와 번호를 직접 비교해 주세요." manualFallback="기기에 표시된 업체와 번호를 직접 비교해 주세요." />{checking && <p role="status">QR 정보를 비교하고 있습니다…</p>}{result && <p className={`collection-qr-result ${result.kind}`} role={result.kind === 'mismatch' || result.kind === 'error' ? 'alert' : 'status'}>{result.message}</p>}</div>}
  </section>;
}

function collectionReturnUrl(state: unknown, search: string): string {
  const fallback = '/admin/dashboard?mode=collect';
  const fromState = state && typeof state === 'object' && 'collectionReturnTo' in state ? state.collectionReturnTo : null;
  const candidates = [fromState, new URLSearchParams(search).get('returnTo')];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin === window.location.origin && url.pathname === '/admin/dashboard' && url.searchParams.get('mode') === 'collect') return `${url.pathname}${url.search}`;
    } catch { /* A broken return URL falls back to the collection dashboard. */ }
  }
  return fallback;
}

function ReportDetail({ publicId }: { publicId: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const collectionMode = new URLSearchParams(location.search).get('from') === 'collection';
  const returnTo = collectionMode ? collectionReturnUrl(location.state, location.search) : '/admin/reports';
  const loader = useCallback((signal: AbortSignal) => adminApi.report(publicId, signal), [publicId]);
  const { data: report, loading, error, reload, replaceData } = useAdminData(loader);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const returnToQueue = (message: string) => { void navigate(returnTo, { replace: true, state: { collectionStatusMessage: message } }); };
  const onUpdated = (updated: AdminReportDetail) => {
    if (collectionMode) {
      const message = updated.status === 'COMPLETED' ? `${adminCompletionLabel(updated.completionMethod)}로 저장했습니다. 다음 수거 대상을 확인하세요.` : '신고를 반려했습니다. 다음 수거 대상을 확인하세요.';
      returnToQueue(message);
      return;
    }
    replaceData(updated);
    setNotice(updated.status === 'COMPLETED' ? `${adminCompletionLabel(updated.completionMethod)} 처리를 저장했습니다.` : '신고를 반려했습니다.');
  };
  const refresh = () => { setNotice(''); reload(); };

  const jurisdiction = report ? adminReportJurisdiction(report) : null;

  return <>
    <Link className="back-link" to={returnTo}><ArrowLeft size={16} />{collectionMode ? '수거 목록으로' : '신고 목록으로'}</Link>
    <div className={`admin-page-heading admin-detail-heading${collectionMode ? ' collection-detail-heading' : ''}`}><div><p className="overline">REPORT DETAIL</p><h1>{collectionMode ? '현장 신고 확인' : '신고 상세'}</h1><p className="admin-report-id">{publicId}</p></div><Button variant="secondary" disabled={loading || saving} onClick={refresh}><RefreshCw size={16} />새로고침</Button></div>
    {notice && <p className="admin-action-success" role="status">{notice}</p>}
    {loading ? <LoadingState label="신고 상세를 불러오고 있습니다" /> : error ? <ErrorState message={error} onRetry={refresh} /> : report && <div className={`admin-detail-grid${collectionMode ? ' collection-detail-grid' : ''}`}>
      <div className="admin-detail-main">
        <DashboardPanel title={collectionMode ? '현장 확인' : '접수 정보'} className="admin-detail-summary">
          <div className="admin-report-status admin-detail-status"><StatusBadge status={report.status} />{report.completionMethod && <strong>{adminCompletionLabel(report.completionMethod)}</strong>}</div>
          <dl className="admin-report-metadata">
            {collectionMode && <>
              <div><dt>운영업체</dt><dd>{report.operatorName || '확인되지 않음'}</dd></div>
              <div><dt>기기번호</dt><dd>{report.deviceId || '확인되지 않음'}</dd></div>
              <div className="admin-metadata-wide"><dt>신고 위치</dt><dd>{report.address || '주소 미입력'}</dd></div>
              <div><dt>접수 일시</dt><dd><time dateTime={report.createdAt}>{formatAdminDate(report.createdAt)}</time></dd></div>
              <div><dt>신고 유형</dt><dd><div className="admin-report-tags">{report.categories.map(category => <span key={category}>{category}</span>)}</div></dd></div>
            </>}
            {!collectionMode && <>
            <div><dt>접수번호</dt><dd className="admin-report-id">{report.publicId}</dd></div>
            <div><dt>접수 일시</dt><dd><time dateTime={report.createdAt}>{formatAdminDate(report.createdAt)}</time></dd></div>
            {jurisdiction?.tenantName && <div><dt>관리 기관</dt><dd>{jurisdiction.tenantName}</dd></div>}<div><dt>신고 지역</dt><dd>{jurisdiction?.regionName}</dd></div>
            <div><dt>운영업체</dt><dd>{report.operatorName || '확인되지 않음'}</dd></div><div><dt>기기번호</dt><dd>{report.deviceId || '확인되지 않음'}</dd></div>
            <div><dt>연락처</dt><dd>{report.contactPhoneMasked || '미입력'}</dd></div>
            <div><dt>완료 일시</dt><dd>{report.completedAt ? <time dateTime={report.completedAt}>{formatAdminDate(report.completedAt)}</time> : report.status === 'REJECTED' ? '해당 없음' : '미완료'}</dd></div>
            <div className="admin-metadata-wide"><dt>신고 위치</dt><dd>{report.address || '주소 미입력'}<small>위도 {report.latitude.toFixed(6)} · 경도 {report.longitude.toFixed(6)}</small></dd></div>
            <div className="admin-metadata-wide"><dt>신고 유형</dt><dd><div className="admin-report-tags">{report.categories.map(category => <span key={category}>{category}</span>)}</div></dd></div>
            </>}
          </dl>
          {collectionMode && <NaverRouteButtons latitude={report.latitude} longitude={report.longitude} destinationName={report.address || `${report.operatorName || '공유 PM'} ${report.deviceId || ''}`} />}
        </DashboardPanel>
        {report.status !== 'COMPLETED' && report.status !== 'REJECTED' && <div className="admin-detail-related"><RelatedReportsPanel key={`${report.publicId}:${report.updatedAt}`} report={report} disabled={saving} onBusyChange={setSaving} onReload={refresh} onCompleted={(count, method) => {
          const message = `신고 ${count}건을 ${adminCompletionLabel(method)}로 저장했습니다. 각 신고의 접수번호와 내역은 유지됩니다.`;
          if (collectionMode) returnToQueue(message);
          else { setNotice(message); reload(); }
        }} /></div>}
        <DashboardPanel title="현장사진" description={collectionMode ? undefined : '사진을 누르면 크게 볼 수 있습니다.'} className="admin-detail-photos"><div className="admin-report-photos">{report.images.map((image, index) => <ReportPhoto key={image.id} image={image} publicId={report.publicId} index={index} />)}</div>{!report.images.length && <p className="field-hint">등록된 사진이 없습니다.</p>}</DashboardPanel>
        {collectionMode && report.status !== 'COMPLETED' && report.status !== 'REJECTED' && <CollectionQrCompare report={report} />}
        {collectionMode && <details className="collection-detail-more dashboard-panel admin-detail-more"><summary>접수번호·기관 등 추가 정보</summary><dl className="admin-report-metadata">
          <div><dt>접수번호</dt><dd className="admin-report-id">{report.publicId}</dd></div>
          {jurisdiction?.tenantName && <div><dt>관리 기관</dt><dd>{jurisdiction.tenantName}</dd></div>}
          <div><dt>신고 지역</dt><dd>{jurisdiction?.regionName}</dd></div>
          <div><dt>좌표</dt><dd>위도 {report.latitude.toFixed(6)} · 경도 {report.longitude.toFixed(6)}</dd></div>
          <div><dt>연락처</dt><dd>{report.contactPhoneMasked || '미입력'}</dd></div>
          <div><dt>완료 일시</dt><dd>{report.completedAt ? <time dateTime={report.completedAt}>{formatAdminDate(report.completedAt)}</time> : report.status === 'REJECTED' ? '해당 없음' : '미완료'}</dd></div>
        </dl></details>}
        <DashboardPanel title="신고 내용" className="admin-detail-description"><p className="admin-report-text">{report.finalReportText}</p>{report.userDescription && <div className="admin-user-description"><h3>추가 설명</h3><p className="admin-report-text">{report.userDescription}</p></div>}</DashboardPanel>
        <DashboardPanel title="처리 이력" className="admin-detail-history"><ol className="admin-report-history">{report.history.map(entry => <li key={entry.id}>
          <div className="admin-history-heading"><div className="admin-report-status"><StatusBadge status={entry.status} />{entry.completionMethod && <strong>{adminCompletionLabel(entry.completionMethod)}</strong>}</div><time dateTime={entry.createdAt}>{formatAdminDate(entry.createdAt)}</time></div>
          <p className="admin-history-author">{entry.adminName || '신고 접수'}</p>
          {entry.publicNote && <div className="admin-history-note"><strong>공개 처리 메모</strong><p>{entry.publicNote}</p></div>}
          {entry.internalNote && <div className="admin-history-note internal"><strong>내부 메모 · 관리자 전용</strong><p>{entry.internalNote}</p></div>}
        </li>)}</ol>{!report.history.length && <p className="field-hint">등록된 처리 이력이 없습니다.</p>}</DashboardPanel>
      </div>
      <aside className="admin-detail-actions"><ReportStatusForm key={`${report.publicId}:${report.updatedAt}`} report={report} collectionMode={collectionMode} onUpdated={onUpdated} onReload={refresh} onBusyChange={setSaving} /></aside>
    </div>}
  </>;
}

export function AdminReportDetailPage() {
  const { publicId = '' } = useParams();
  const { session } = useAuth();
  if (session?.mode === 'development-mock') return <DashboardPanel title="신고 상세"><EmptyState title="신고 상세 예시 화면입니다" description="실제 신고 상세는 DB 관리자 계정으로 로그인한 뒤 확인할 수 있습니다."><Link className="button button-secondary" to="/admin/reports">신고 목록으로</Link></EmptyState></DashboardPanel>;
  return <ReportDetail key={publicId} publicId={publicId} />;
}
