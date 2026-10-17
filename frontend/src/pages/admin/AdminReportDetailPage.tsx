import { ArrowLeft, Camera, RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import type { AdminReportDetail } from '../../api/admin';
import { DashboardPanel } from '../../components/AdminCards';
import { Button, EmptyState, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { useAuth } from '../../features/admin/auth-context';
import { ReportStatusForm } from '../../features/admin/ReportStatusForm';
import { RelatedReportsPanel } from '../../features/admin/RelatedReportsPanel';
import { adminCompletionLabel, formatAdminDate } from '../../features/admin/report-display';
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

function ReportDetail({ publicId }: { publicId: string }) {
  const loader = useCallback((signal: AbortSignal) => adminApi.report(publicId, signal), [publicId]);
  const { data: report, loading, error, reload, replaceData } = useAdminData(loader);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const onUpdated = (updated: AdminReportDetail) => {
    replaceData(updated);
    setNotice(updated.status === 'COMPLETED' ? `${adminCompletionLabel(updated.completionMethod)} 처리를 저장했습니다.` : '처리중 상태로 변경했습니다.');
  };
  const refresh = () => { setNotice(''); reload(); };

  return <>
    <Link className="back-link" to="/admin/reports"><ArrowLeft size={16} />신고 목록으로</Link>
    <div className="admin-page-heading admin-detail-heading"><div><p className="overline">REPORT DETAIL</p><h1>신고 상세</h1><p className="admin-report-id">{publicId}</p></div><Button variant="secondary" disabled={loading || saving} onClick={refresh}><RefreshCw size={16} />새로고침</Button></div>
    {notice && <p className="admin-action-success" role="status">{notice}</p>}
    {loading ? <LoadingState label="신고 상세를 불러오고 있습니다" /> : error ? <ErrorState message={error} onRetry={refresh} /> : report && <div className="admin-detail-grid">
      <div className="admin-detail-main">
        <DashboardPanel title="접수 정보">
          <div className="admin-report-status admin-detail-status"><StatusBadge status={report.status} />{report.completionMethod && <strong>{adminCompletionLabel(report.completionMethod)}</strong>}</div>
          <dl className="admin-report-metadata">
            <div><dt>접수번호</dt><dd className="admin-report-id">{report.publicId}</dd></div>
            <div><dt>접수 일시</dt><dd><time dateTime={report.createdAt}>{formatAdminDate(report.createdAt)}</time></dd></div>
            <div><dt>관리 기관</dt><dd>{report.tenant.name}</dd></div><div><dt>지역</dt><dd>{report.region.name}</dd></div>
            <div><dt>운영업체</dt><dd>{report.operatorName || '확인되지 않음'}</dd></div><div><dt>기기번호</dt><dd>{report.deviceId || '확인되지 않음'}</dd></div>
            <div><dt>연락처</dt><dd>{report.contactPhoneMasked || '미입력'}</dd></div>
            <div><dt>완료 일시</dt><dd>{report.completedAt ? <time dateTime={report.completedAt}>{formatAdminDate(report.completedAt)}</time> : '미완료'}</dd></div>
            <div className="admin-metadata-wide"><dt>신고 위치</dt><dd>{report.address || '주소 미입력'}<small>위도 {report.latitude.toFixed(6)} · 경도 {report.longitude.toFixed(6)}</small></dd></div>
            <div className="admin-metadata-wide"><dt>신고 유형</dt><dd><div className="admin-report-tags">{report.categories.map(category => <span key={category}>{category}</span>)}</div></dd></div>
          </dl>
        </DashboardPanel>
        {report.status !== 'COMPLETED' && <RelatedReportsPanel key={`${report.publicId}:${report.updatedAt}`} report={report} disabled={saving} onBusyChange={setSaving} onReload={refresh} onCompleted={(count, method) => {
          setNotice(`신고 ${count}건을 ${adminCompletionLabel(method)}로 저장했습니다. 각 신고의 접수번호와 내역은 유지됩니다.`);
          reload();
        }} />}
        <DashboardPanel title="현장사진" description="사진을 누르면 크게 볼 수 있습니다."><div className="admin-report-photos">{report.images.map((image, index) => <ReportPhoto key={image.id} image={image} publicId={report.publicId} index={index} />)}</div>{!report.images.length && <p className="field-hint">등록된 사진이 없습니다.</p>}</DashboardPanel>
        <DashboardPanel title="신고 내용"><p className="admin-report-text">{report.finalReportText}</p>{report.userDescription && <div className="admin-user-description"><h3>추가 설명</h3><p className="admin-report-text">{report.userDescription}</p></div>}</DashboardPanel>
        <DashboardPanel title="처리 이력"><ol className="admin-report-history">{report.history.map(entry => <li key={entry.id}>
          <div className="admin-history-heading"><div className="admin-report-status"><StatusBadge status={entry.status} />{entry.completionMethod && <strong>{adminCompletionLabel(entry.completionMethod)}</strong>}</div><time dateTime={entry.createdAt}>{formatAdminDate(entry.createdAt)}</time></div>
          <p className="admin-history-author">{entry.adminName || '신고 접수'}</p>
          {entry.publicNote && <div className="admin-history-note"><strong>공개 처리 메모</strong><p>{entry.publicNote}</p></div>}
          {entry.internalNote && <div className="admin-history-note internal"><strong>내부 메모 · 관리자 전용</strong><p>{entry.internalNote}</p></div>}
        </li>)}</ol>{!report.history.length && <p className="field-hint">등록된 처리 이력이 없습니다.</p>}</DashboardPanel>
      </div>
      <aside className="admin-detail-actions"><ReportStatusForm key={`${report.publicId}:${report.updatedAt}`} report={report} onUpdated={onUpdated} onReload={refresh} onBusyChange={setSaving} /></aside>
    </div>}
  </>;
}

export function AdminReportDetailPage() {
  const { publicId = '' } = useParams();
  const { session } = useAuth();
  if (session?.mode === 'development-mock') return <DashboardPanel title="신고 상세"><EmptyState title="개발 계정의 화면 미리보기입니다" description="실제 신고 상세는 DB 관리자 계정으로 로그인한 뒤 확인할 수 있습니다."><Link className="button button-secondary" to="/admin/reports">신고 목록으로</Link></EmptyState></DashboardPanel>;
  return <ReportDetail key={publicId} publicId={publicId} />;
}
