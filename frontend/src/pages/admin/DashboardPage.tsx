import { ArrowUpRight, Ban, CalendarDays, CheckCheck, FilePlus2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import type { AdminReportSummary, Dashboard } from '../../api/admin';
import { DashboardPanel, ReportTable } from '../../components/AdminCards';
import { Button, ErrorState, LoadingState, PhaseNotice, StatusBadge } from '../../components/ui';
import { AdminReportMapWidget } from '../../features/admin/AdminReportMapWidget';
import { CollectionMode } from '../../features/admin/CollectionMode';
import { adminCompletionLabel, formatAdminDate } from '../../features/admin/report-display';
import { useAdminData } from '../../features/admin/useAdminData';
import './DashboardPage.css';

type Summary = Dashboard['summary'];

function count(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('ko-KR');
}

function percentage(value: number | null, total: number | null): string {
  if (value === null || total === null) return '—';
  return total === 0 ? '0%' : `${(value / total * 100).toFixed(1)}%`;
}

function MetricCard({ label, value, caption, icon, tone }: {
  label: string;
  value: number | null;
  caption: string;
  icon: ReactNode;
  tone: 'blue' | 'amber' | 'teal' | 'rose';
}) {
  return <article className={`dashboard-metric dashboard-metric-${tone}`}>
    <div className="dashboard-metric-heading"><span>{label}</span><span className="dashboard-metric-icon" aria-hidden="true">{icon}</span></div>
    <p className="dashboard-metric-value">{count(value)}<span>건</span></p>
    <p className="dashboard-metric-caption">{caption}</p>
  </article>;
}

function StatusOverview({ summary }: { summary: Summary }) {
  const { total, received, processing, completed, rejected } = summary;
  const open = received === null || processing === null ? null : received + processing;
  const statuses = [
    { label: '접수', value: received, tone: 'received' },
    { label: '반려', value: rejected, tone: 'rejected' },
    { label: '처리 완료', value: completed, tone: 'completed' },
    ...(processing ? [{ label: '처리 중 (기존)', value: processing, tone: 'processing' }] as const : []),
  ] as const;

  return <DashboardPanel title="신고 처리 현황" description="전체 기간 · 조회 권한 내 신고" className="dashboard-status-overview">
    <div className="dashboard-status-total"><span>전체 신고</span><strong>{count(total)}<small>건</small></strong></div>
    <div className="dashboard-status-rate"><span>처리 완료율</span><strong>{percentage(completed, total)}</strong></div>
    <div className="dashboard-status-bar" aria-hidden="true">
      {total !== null && total > 0 && statuses.map(status => <span key={status.tone} className={`dashboard-status-segment ${status.tone}`} style={{ width: `${Math.max(0, Math.min(100, (status.value ?? 0) / total * 100))}%` }} />)}
    </div>
    <ul className="dashboard-status-list">
      {statuses.map(status => <li key={status.tone}><span className={`dashboard-status-dot ${status.tone}`} /><span>{status.label}</span><strong>{count(status.value)}건</strong><small>{percentage(status.value, total)}</small></li>)}
    </ul>
    <div className="dashboard-open-queue"><div><span>현재 미처리</span><strong>{count(open)}건</strong><small>{processing ? '접수 + 기존 처리 중' : '접수된 신고'}</small></div><Link to="/admin/reports">신고 관리로 이동<ArrowUpRight size={15} /></Link></div>
  </DashboardPanel>;
}

function RecentReportCards({ reports, skeleton }: { reports: AdminReportSummary[]; skeleton: boolean }) {
  return <div className="dashboard-recent-mobile">
    {skeleton || reports.length === 0 ? <p className="dashboard-recent-empty">{skeleton ? '실제 신고 데이터가 연결되지 않았습니다.' : '최근 접수된 신고가 없습니다.'}</p> : <ul>
      {reports.map(report => <li key={report.publicId}>
        <div className="dashboard-recent-card-top"><Link to={`/admin/reports/${encodeURIComponent(report.publicId)}`}>{report.publicId}</Link><StatusBadge status={report.status} /></div>
        <p>{report.address || '주소 미입력'}</p>
        <div className="dashboard-recent-card-meta"><span>{report.operatorName || '업체 미확인'}{report.deviceId ? ` · ${report.deviceId}` : ''}</span><time dateTime={report.createdAt}>{formatAdminDate(report.createdAt)}</time></div>
        {report.completionMethod && <small>{adminCompletionLabel(report.completionMethod)}</small>}
      </li>)}
    </ul>}
  </div>;
}

function ManagementMode({ refreshKey }: { refreshKey: number }) {
  const loader = useCallback((signal: AbortSignal) => adminApi.dashboard(signal), []);
  const { data, loading, error, reload } = useAdminData(loader);
  const lastRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (lastRefreshKey.current === refreshKey) return;
    lastRefreshKey.current = refreshKey;
    reload();
  }, [refreshKey, reload]);

  return loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : data && <>
      {data.mode === 'skeleton' && <PhaseNotice compact>개발용 관리자 계정에서는 실제 신고 DB를 조회하지 않습니다. 지도와 신고 건수를 보려면 DB 관리자 계정으로 로그인해 주세요.</PhaseNotice>}
      <div className="dashboard-metrics" aria-label="신고 핵심 현황">
        <MetricCard label="오늘 접수" value={data.summary.today} caption="한국 시간 기준" icon={<CalendarDays size={21} />} tone="blue" />
        <MetricCard label="접수" value={data.summary.received} caption="전체 기간 · 아직 처리 전" icon={<FilePlus2 size={21} />} tone="amber" />
        <MetricCard label="반려" value={data.summary.rejected} caption="전체 기간 · 반려된 신고" icon={<Ban size={21} />} tone="rose" />
        <MetricCard label="처리 완료" value={data.summary.completed} caption="전체 기간 · 수거 또는 견인" icon={<CheckCheck size={21} />} tone="teal" />
      </div>
      <div className="dashboard-overview-grid">
        <AdminReportMapWidget key={refreshKey} dashboard />
        <StatusOverview summary={data.summary} />
      </div>
      <DashboardPanel title="최근 접수 신고" description="가장 최근 접수된 신고를 최대 10건 표시합니다. 신고번호를 누르면 상세 내용을 확인할 수 있습니다." action className="dashboard-recent-reports"><div className="dashboard-recent-desktop"><ReportTable reports={data.recentReports} skeleton={data.mode === 'skeleton'} /></div><RecentReportCards reports={data.recentReports} skeleton={data.mode === 'skeleton'} /></DashboardPanel>
    </>;
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const mode = searchParams.get('mode') === 'collect' ? 'collect' : 'manage';
  const pageValue = Number(searchParams.get('page'));
  const page = Number.isSafeInteger(pageValue) && pageValue >= 1 && pageValue <= 10_000 ? pageValue : 1;
  const focusedPublicId = searchParams.get('focus');
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState(() => {
    const message = (location.state as { collectionStatusMessage?: unknown } | null)?.collectionStatusMessage;
    return typeof message === 'string' ? message : '';
  });
  const noticeStateCleared = useRef(false);

  useEffect(() => {
    if (!notice || noticeStateCleared.current) return;
    noticeStateCleared.current = true;
    void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, navigate, notice]);

  const switchMode = (nextMode: 'manage' | 'collect') => {
    setNotice('');
    setSearchParams(current => {
      const updated = new URLSearchParams(current);
      if (nextMode === 'collect') updated.set('mode', 'collect');
      else updated.delete('mode');
      updated.delete('page');
      updated.delete('focus');
      return updated;
    });
  };

  const changePage = (nextPage: number) => {
    setSearchParams(current => {
      const updated = new URLSearchParams(current);
      updated.set('mode', 'collect');
      if (nextPage > 1) updated.set('page', String(nextPage));
      else updated.delete('page');
      updated.delete('focus');
      return updated;
    });
  };

  const focusReport = (publicId: string) => {
    setSearchParams(current => {
      const updated = new URLSearchParams(current);
      updated.set('mode', 'collect');
      updated.set('focus', publicId);
      return updated;
    }, { replace: true });
  };

  return <div className="admin-dashboard-page">
    <div className="admin-page-heading">
      <div><h1>{mode === 'manage' ? '대시보드' : '수거 모드'}</h1><p>{mode === 'manage' ? '신고 접수와 처리 현황을 한눈에 확인하세요.' : '현재 위치에서 가까운 미완료 신고부터 확인하세요.'}</p></div>
      <div className="dashboard-heading-actions">
        <div className="dashboard-mode-switch" role="group" aria-label="대시보드 모드">
          <button type="button" aria-pressed={mode === 'manage'} className={mode === 'manage' ? 'active' : ''} onClick={() => switchMode('manage')}>관리 모드</button>
          <button type="button" aria-pressed={mode === 'collect'} className={mode === 'collect' ? 'active' : ''} onClick={() => switchMode('collect')}>수거 모드</button>
        </div>
        <Button variant="secondary" onClick={() => setRefreshKey(value => value + 1)}><RefreshCw size={16} />새로고침</Button>
      </div>
    </div>
    {mode === 'manage' ? <ManagementMode refreshKey={refreshKey} /> : <>{notice && <p className="collection-return-notice" role="status">{notice}</p>}<CollectionMode refreshKey={refreshKey} page={page} focusedPublicId={focusedPublicId} onPageChange={changePage} onFocusChange={focusReport} /></>}
  </div>;
}
