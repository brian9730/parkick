import { ArrowUpRight, ChevronLeft, ChevronRight, MapPin, RefreshCw, Search } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import type { AdminHotspots, AdminReportStatus, ReportFilters } from '../../api/admin';
import { Button, EmptyState, ErrorState, LoadingState, PhaseNotice } from '../../components/ui';
import { AdminNaverReportMap } from './AdminNaverReportMap';
import { useAdminData } from './useAdminData';
import './report-map.css';

const initialFilters: ReportFilters = { page: 1, pageSize: 200, status: '', q: '' };

export function AdminReportMapWidget({ dashboard = false }: { dashboard?: boolean }) {
  const prefix = useId();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  const [hotspotsEnabled, setHotspotsEnabled] = useState(true);
  const loader = useCallback((signal: AbortSignal) => adminApi.reportMap(filters, signal), [filters]);
  const { data, loading, error, reload } = useAdminData(loader);
  const hotspotLoader = useCallback((signal: AbortSignal): Promise<AdminHotspots> => dashboard
    ? adminApi.reportHotspots({ status: filters.status, q: filters.q }, signal)
    : Promise.resolve({ mode: 'skeleton', zones: [], totalReports: 0 }), [dashboard, filters.status, filters.q]);
  const { data: hotspotData, loading: hotspotsLoading, error: hotspotsError, reload: reloadHotspots } = useAdminData(hotspotLoader);
  const redZones = hotspotData?.zones.filter(zone => zone.level === 'red').length ?? 0;
  const yellowZones = hotspotData?.zones.filter(zone => zone.level === 'yellow').length ?? 0;
  const reloadMap = () => { reload(); if (dashboard) reloadHotspots(); };
  const hotspotPanel = dashboard ? <aside className="admin-hotspot-panel" aria-label="신고 집중 구역">
    <div className="admin-hotspot-heading"><strong>신고 집중 구역</strong><button type="button" className="admin-hotspot-switch" role="switch" aria-label="신고 집중 구역 표시" aria-checked={hotspotsEnabled} onClick={() => setHotspotsEnabled(value => !value)}><span /></button></div>
    {hotspotsLoading ? <p className="admin-hotspot-message">구역 분석 중...</p> : hotspotsError ? <p className="admin-hotspot-message" role="alert">구역을 불러오지 못했습니다. <button type="button" onClick={reloadHotspots}>다시 시도</button></p> : <>
      <div className="admin-hotspot-row"><span className="admin-hotspot-dot red" />집중 구역 <strong>{redZones}곳</strong><small>5건 이상</small></div>
      <div className="admin-hotspot-row"><span className="admin-hotspot-dot yellow" />관심 구역 <strong>{yellowZones}곳</strong><small>3~4건</small></div>
      <p className="admin-hotspot-note">현재 검색 조건의 전체 신고에서 150m 이내의 가까운 신고를 묶어 표시합니다.</p>
    </>}
  </aside> : undefined;
  const skeleton = data?.mode === 'skeleton';
  const totalPages = data ? Math.max(1, Math.min(10_000, Math.ceil(data.total / data.pageSize))) : 1;
  const start = data?.items.length ? (data.page - 1) * data.pageSize + 1 : 0;
  const end = data ? start ? start + data.items.length - 1 : 0 : 0;

  return <section className={`dashboard-panel admin-report-map-widget ${dashboard ? 'admin-dashboard-map' : ''}`} id={dashboard ? 'report-map' : undefined} aria-label="신고 지도 조회">
    <div className="panel-heading"><div><h2>{dashboard ? '신고 위치 현황' : '접수 위치'}</h2>{!dashboard && <p>모여 있는 신고의 숫자를 누르면 지도가 확대됩니다. 개별 위치를 눌러 신고 정보를 확인하세요.</p>}</div><div className="admin-map-heading-actions">{dashboard && <Link className="text-link" to="/admin/map">전체 보기<ArrowUpRight size={16} /></Link>}<Button variant="secondary" onClick={reloadMap} disabled={loading} aria-label="신고 지도 새로고침"><RefreshCw size={16} /></Button></div></div>
    {skeleton && <PhaseNotice compact>개발용 관리자 계정에서는 실제 신고 위치를 표시하지 않습니다.</PhaseNotice>}
    <form className="report-filters admin-report-filters admin-map-filters" onSubmit={event => { event.preventDefault(); setFilters(value => ({ ...value, page: 1, q: search.trim() })); }}>
      <div className="filter-field"><label className={dashboard ? 'sr-only' : undefined} htmlFor={`${prefix}-status`}>처리 상태</label><select id={`${prefix}-status`} disabled={skeleton} value={filters.status} onChange={event => setFilters(value => ({ ...value, page: 1, status: event.target.value as AdminReportStatus | '' }))}><option value="">전체 상태</option><option value="RECEIVED">접수</option><option value="REJECTED">반려</option><option value="COMPLETED">처리완료</option><option value="PROCESSING">처리중 (기존)</option></select></div>
      <div className="filter-field search-filter"><label className={dashboard ? 'sr-only' : undefined} htmlFor={`${prefix}-search`}>지도 신고 검색</label><div className="input-with-icon"><Search size={17} /><input id={`${prefix}-search`} disabled={skeleton} maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder={dashboard ? '신고번호·주소 검색' : '신고번호, 업체, 기기번호, 주소'} /></div></div>
      <Button type="submit" disabled={skeleton || loading}>검색</Button>
      {(filters.q || filters.status) && <Button type="button" variant="secondary" onClick={() => { setSearch(''); setFilters(initialFilters); }}>초기화</Button>}
    </form>
    {loading ? <LoadingState label="지도에 표시할 신고를 불러오고 있습니다" /> : error ? <ErrorState message={error} onRetry={reload} /> : data && <>
      {skeleton ? <EmptyState icon={<MapPin size={28} />} title="개발용 관리자 화면입니다" description="이 계정은 실제 신고 DB를 조회하지 않습니다. DB 관리자 계정으로 로그인해 주세요." /> : <>
        {(!dashboard || filters.q || filters.status || data.total > data.pageSize) && <div className="admin-map-summary"><p role="status">{dashboard ? `${filters.q || filters.status ? '검색 결과' : '전체 신고'} ${data.total.toLocaleString('ko-KR')}건${data.total > data.pageSize ? ` · ${start.toLocaleString('ko-KR')}–${end.toLocaleString('ko-KR')}건 표시` : ''}` : `전체 ${data.total.toLocaleString('ko-KR')}건 중 ${start.toLocaleString('ko-KR')}–${end.toLocaleString('ko-KR')}건 표시`}</p>{!dashboard && <span>페이지당 최대 200건</span>}</div>}
        <ul className="admin-map-legend" aria-label="신고 지도 상태 범례"><li><span className="received" />접수</li><li><span className="rejected" />반려</li><li><span className="completed" />처리완료</li><li><span className="processing" />처리중 (기존)</li><li><span className="mixed" />여러 상태</li></ul>
        {data.items.length ? <AdminNaverReportMap reports={data.items} hotspots={dashboard ? hotspotData?.zones : undefined} showHotspots={dashboard && hotspotsEnabled} hotspotPanel={hotspotPanel} /> : <EmptyState icon={<MapPin size={28} />} title={filters.q || filters.status ? '검색 조건에 맞는 신고가 없어요' : data.total ? '이 페이지에 표시할 신고가 없어요' : '접수된 신고가 없어요'} description={filters.q || filters.status ? '검색어나 처리 상태를 바꿔 다시 확인해 주세요.' : data.total ? '이전 페이지로 이동하거나 새로고침해 주세요.' : '신고가 접수되면 저장된 위치를 지도에 표시합니다.'} />}
        <div className="admin-map-footer">{!dashboard && <p>가까운 신고는 건수를 합쳐 표시하며, 확대하면 위치별로 나뉩니다. 같은 위치이거나 최대 확대에서도 겹치는 신고는 숫자를 눌러 모두 확인할 수 있습니다.</p>}<Link className="text-link" to="/admin/reports">신고 목록 보기<ArrowUpRight size={14} /></Link></div>
        {data.total > 0 && <nav className="admin-pagination" aria-label="신고 지도 페이지"><Button variant="secondary" disabled={data.page <= 1} onClick={() => setFilters(value => ({ ...value, page: value.page - 1 }))}><ChevronLeft size={16} />이전</Button><span>{data.page} / {totalPages} 페이지</span><Button variant="secondary" disabled={data.page >= totalPages} onClick={() => setFilters(value => ({ ...value, page: value.page + 1 }))}>다음<ChevronRight size={16} /></Button></nav>}
        {data.total > 10_000 * data.pageSize && <p className="field-hint">조회 범위를 넘는 신고는 상태나 검색 조건을 좁혀 확인해 주세요.</p>}
      </>}
    </>}
  </section>;
}
