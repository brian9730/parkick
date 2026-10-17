import { CalendarDays, CheckCheck, ClipboardList, Clock3, FilePlus2, PieChart, RefreshCw } from 'lucide-react';
import { adminApi } from '../../api/admin';
import { DashboardPanel, DashboardStatCard, ReportTable } from '../../components/AdminCards';
import { Button, EmptyState, ErrorState, LoadingState, PhaseNotice } from '../../components/ui';
import { AdminReportMapWidget } from '../../features/admin/AdminReportMapWidget';
import { useAdminData } from '../../features/admin/useAdminData';

export function DashboardPage() {
  const { data, loading, error, reload } = useAdminData(adminApi.dashboard);
  return <>
    <div className="admin-page-heading"><div><p className="overline">OVERVIEW</p><h1>관리자 대시보드</h1><p>접수된 신고와 처리 현황을 확인하세요.</p></div><Button variant="secondary" onClick={reload} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />새로고침</Button></div>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : data && <>
      {data.mode === 'skeleton' && <PhaseNotice compact>개발 계정의 화면 미리보기입니다. 집계와 목록은 실제 신고 데이터가 아닙니다.</PhaseNotice>}
      <div className="stats-grid">
        <DashboardStatCard label="오늘 신고" value={data.summary.today} icon={<CalendarDays size={22} />} />
        <DashboardStatCard label="전체 신고" value={data.summary.total} icon={<ClipboardList size={22} />} />
        <DashboardStatCard label="접수" value={data.summary.received} icon={<FilePlus2 size={22} />} tone="amber" />
        <DashboardStatCard label="처리중" value={data.summary.processing} icon={<Clock3 size={22} />} />
        <DashboardStatCard label="처리완료" value={data.summary.completed} icon={<CheckCheck size={22} />} tone="green" />
      </div>
      <AdminReportMapWidget dashboard />
      <DashboardPanel title="최근 신고" description="최근 접수된 신고 10건입니다." action><ReportTable reports={data.recentReports} skeleton={data.mode === 'skeleton'} /></DashboardPanel>
      <div className="admin-dashboard-secondary">
        <DashboardPanel title="상세 통계" description="유형별·기간별 통계는 준비 중입니다." id="statistics"><EmptyState icon={<PieChart size={28} />} title="상세 통계를 준비하고 있어요" description="현재 신고 건수와 처리 현황은 위 집계에서 확인할 수 있습니다." /></DashboardPanel>
      </div>
    </>}
  </>;
}
