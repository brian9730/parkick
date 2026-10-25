import { ArrowRight, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AdminReportSummary } from '../api/admin';
import { adminCompletionLabel, adminReportJurisdiction, formatAdminDate } from '../features/admin/report-display';
import { EmptyState, StatusBadge } from './ui';

export function DashboardStatCard({ label, value, icon, tone = 'blue' }: { label: string; value: number | null; icon: ReactNode; tone?: string }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><p>{label}</p><strong>{value === null ? '—' : value.toLocaleString('ko-KR')}</strong><small>{value === null ? '데이터 미연결' : label === '오늘 신고' ? '한국 시간 기준' : '조회 권한 내 신고'}</small></div></article>;
}

export function DashboardPanel({ title, description, children, action, id, className = '' }: { title: string; description?: string; children: ReactNode; action?: boolean; id?: string; className?: string }) {
  return <section className={`dashboard-panel ${className}`} id={id}><div className="panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action && <Link className="text-link" to="/admin/reports">전체 보기<ArrowRight size={14} /></Link>}</div>{children}</section>;
}

export function ReportTable({ reports, skeleton = false, filtered = false }: { reports: AdminReportSummary[]; skeleton?: boolean; filtered?: boolean }) {
  return <div className="report-table-wrap"><table className="report-table admin-report-table">
    <caption className="sr-only">{skeleton ? '신고 목록 예시 화면' : '신고 목록. 접수번호를 누르면 상세 내용을 볼 수 있습니다.'}</caption>
    <thead><tr><th scope="col">신고번호</th><th scope="col">운영업체</th><th scope="col">신고 위치</th><th scope="col">신고 유형</th><th scope="col">접수일시</th><th scope="col">처리 상태</th></tr></thead>
    <tbody>{skeleton || !reports.length ? <tr><td colSpan={6}><EmptyState icon={<Inbox size={26} />}
      title={skeleton ? '신고 데이터가 연결되지 않았어요' : filtered ? '검색 조건에 맞는 신고가 없어요' : '접수된 신고가 없어요'}
      description={skeleton ? '실제 신고 건수를 나타내지 않습니다.' : filtered ? '검색어나 처리 상태를 바꾸어 다시 확인해 주세요.' : '새로운 신고가 접수되면 여기에 표시됩니다.'} /></td></tr>
      : reports.map(report => <tr key={report.publicId}>
        <td><Link className="admin-report-id" to={`/admin/reports/${encodeURIComponent(report.publicId)}`}>{report.publicId}</Link><small>{[adminReportJurisdiction(report).tenantName, adminReportJurisdiction(report).regionName].filter(Boolean).join(' · ')}</small></td>
        <td>{report.operatorName || '확인되지 않음'}<small>{report.deviceId || '기기번호 없음'}</small></td>
        <td className="admin-address-cell">{report.address || '주소 미입력'}</td>
        <td><div className="admin-report-tags">{report.categories.map(category => <span key={category}>{category}</span>)}</div></td>
        <td><time dateTime={report.createdAt}>{formatAdminDate(report.createdAt)}</time></td>
        <td><div className="admin-report-status"><StatusBadge status={report.status} />{report.completionMethod && <small>{adminCompletionLabel(report.completionMethod)}</small>}</div></td>
      </tr>)}</tbody>
  </table></div>;
}
