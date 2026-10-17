import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { adminApi } from '../../api/admin';
import type { AdminReportStatus, ReportFilters } from '../../api/admin';
import { DashboardPanel, ReportTable } from '../../components/AdminCards';
import { Button, ErrorState, LoadingState, PhaseNotice } from '../../components/ui';
import { useAdminData } from '../../features/admin/useAdminData';

export function ReportsPage() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ReportFilters>({ page: 1, pageSize: 20, status: '', q: '' });
  const loader = useCallback((signal: AbortSignal) => adminApi.reports(filters, signal), [filters]);
  const { data, loading, error, reload } = useAdminData(loader);
  const totalPages = data ? Math.max(1, Math.min(10_000, Math.ceil(data.total / data.pageSize))) : 1;
  const skeleton = data?.mode === 'skeleton';

  return <>
    <div className="admin-page-heading"><div><p className="overline">REPORT MANAGEMENT</p><h1>신고 목록</h1><p>신고 내용을 확인하고 처리 상태를 관리하세요.</p></div><Button variant="secondary" onClick={reload} disabled={loading}><RefreshCw size={16} />새로고침</Button></div>
    {skeleton && <PhaseNotice compact>개발 계정의 목록 미리보기입니다. 실제 신고 데이터가 연결되지 않았습니다.</PhaseNotice>}
    <form className="report-filters admin-report-filters" onSubmit={event => { event.preventDefault(); setFilters(value => ({ ...value, page: 1, q: search.trim() })); }}>
      <div className="filter-field"><label htmlFor="status-filter">처리 상태</label><select id="status-filter" disabled={skeleton} value={filters.status} onChange={event => setFilters(value => ({ ...value, page: 1, status: event.target.value as AdminReportStatus | '' }))}><option value="">전체 상태</option><option value="RECEIVED">접수</option><option value="PROCESSING">처리중</option><option value="COMPLETED">처리완료</option></select></div>
      <div className="filter-field search-filter"><label htmlFor="search-report">신고 검색</label><div className="input-with-icon"><Search size={17} /><input id="search-report" disabled={skeleton} maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder="신고번호, 업체, 기기번호, 주소" /></div></div>
      <Button type="submit" disabled={skeleton || loading}>검색</Button>
      {(filters.q || filters.status) && <Button variant="secondary" onClick={() => { setSearch(''); setFilters({ page: 1, pageSize: 20, status: '', q: '' }); }}>초기화</Button>}
    </form>
    {loading ? <LoadingState label="신고 목록을 불러오고 있습니다" /> : error ? <ErrorState message={error} onRetry={reload} /> : data && <>
      <DashboardPanel title={skeleton ? '신고 목록 미리보기' : `신고 ${data.total.toLocaleString('ko-KR')}건`} description={filters.q ? `“${filters.q}” 검색 결과` : undefined}><ReportTable reports={data.items} skeleton={skeleton} filtered={Boolean(filters.q || filters.status)} /></DashboardPanel>
      {!skeleton && <nav className="admin-pagination" aria-label="신고 목록 페이지"><Button variant="secondary" disabled={data.page <= 1} onClick={() => setFilters(value => ({ ...value, page: value.page - 1 }))}><ChevronLeft size={16} />이전</Button><span>{data.page} / {totalPages} 페이지</span><Button variant="secondary" disabled={data.page >= totalPages} onClick={() => setFilters(value => ({ ...value, page: value.page + 1 }))}>다음<ChevronRight size={16} /></Button></nav>}
    </>}
  </>;
}
