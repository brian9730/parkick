import { Link } from 'react-router-dom';
import { List } from 'lucide-react';
import { AdminReportMapWidget } from '../../features/admin/AdminReportMapWidget';

export function AdminReportMapPage() {
  return <>
    <div className="admin-page-heading"><div><p className="overline">REPORT MAP</p><h1>신고 지도</h1><p>접수된 신고 위치와 처리 상태를 지도에서 확인하세요.</p></div><Link className="button button-secondary" to="/admin/reports"><List size={17} />신고 목록</Link></div>
    <AdminReportMapWidget />
  </>;
}
