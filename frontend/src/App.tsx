import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminLayout, RequireAdmin } from './components/AdminLayout';
import { PublicLayout } from './components/PublicLayout';
import { AuthProvider } from './features/admin/AuthProvider';
import { ReportLookupProvider } from './features/report/ReportLookupProvider';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { ReportsPage } from './pages/admin/ReportsPage';
import { AdminReportDetailPage } from './pages/admin/AdminReportDetailPage';
import { AdminReportMapPage } from './pages/admin/AdminReportMapPage';
import { ReportPage } from './pages/report/ReportPage';
import { ReportCompletePage, ReportStatusPage } from './pages/report/ReportStatusPage';
import { PublicReportDetailPage } from './pages/report/PublicReportDetailPage';

function RouteEffects() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const titles: Record<string, string> = { '/': '더 안전한 거리를 함께', '/report': '공유 킥보드 신고', '/report/status': '처리결과 조회', '/report/complete': '신고 접수 확인', '/admin/login': '관리자 로그인', '/admin/dashboard': '관리자 대시보드', '/admin/reports': '신고 목록', '/admin/map': '신고 지도' };
    document.title = `Parkick | ${titles[pathname] || '신고 정보'}`;
    if (!hash) window.scrollTo({ top: 0 });
    else requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
  }, [pathname, hash]);
  return null;
}

export function App() {
  return <AuthProvider><RouteEffects /><Routes><Route element={<PublicLayout />}><Route path="/" element={<HomePage />} /><Route path="/report" element={<ReportPage />} /><Route path="/report/complete" element={<ReportCompletePage />} /><Route element={<ReportLookupProvider />}><Route path="/report/status" element={<ReportStatusPage />} /><Route path="/report/status/:publicId" element={<PublicReportDetailPage />} /></Route></Route><Route path="/admin/login" element={<AdminLoginPage />} /><Route element={<RequireAdmin />}><Route path="/admin" element={<AdminLayout />}><Route index element={<Navigate to="dashboard" replace />} /><Route path="dashboard" element={<DashboardPage />} /><Route path="reports" element={<ReportsPage />} /><Route path="reports/:publicId" element={<AdminReportDetailPage />} /><Route path="map" element={<AdminReportMapPage />} /><Route path="*" element={<NotFoundPage />} /></Route></Route><Route element={<PublicLayout />}><Route path="*" element={<NotFoundPage />} /></Route></Routes></AuthProvider>;
}
