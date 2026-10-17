import { BarChart3, CalendarDays, ChevronRight, ExternalLink, FileText, Home, LayoutDashboard, LogOut, Map, Menu, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/admin/auth-context';
import { ErrorState, LoadingState, ParkickLogo } from './ui';
import '../features/admin/reports.css';

export function RequireAdmin() {
  const { session, loading, error, refresh } = useAuth();
  if (loading) return <LoadingState label="관리자 인증을 확인하고 있습니다" />;
  if (error) return <div className="container auth-error"><ErrorState message={error} onRetry={() => void refresh()} /><Link className="text-link" to="/admin/login">관리자 로그인으로 이동<ChevronRight size={16} /></Link></div>;
  return session ? <Outlet /> : <Navigate to="/admin/login" replace />;
}

export function AdminLayout() {
  const { session, logout } = useAuth();
  const isDevelopmentMock = session?.mode === 'development-mock';
  const adminLabel = isDevelopmentMock ? '개발 관리자'
    : session?.admin.role === 'PLATFORM_ADMIN' ? '플랫폼 관리자'
    : session?.admin.role === 'TENANT_ADMIN' ? '지자체 관리자' : '관리자';
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const location = useLocation();
  const isDashboard = location.pathname === '/admin/dashboard';
  const breadcrumb = isDashboard ? '대시보드' : location.pathname === '/admin/map' ? '신고 지도' : '신고 관리';
  const today = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date());
  const onLogout = async () => {
    setLoggingOut(true); setError('');
    try { await logout(); } catch (failure) { setError(failure instanceof Error ? failure.message : '로그아웃하지 못했습니다.'); } finally { setLoggingOut(false); }
  };
  return <div className="admin-layout"><a className="skip-link" href="#admin-content">본문 바로가기</a><aside className={`admin-sidebar ${menuOpen ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><ParkickLogo /><span>MANAGEMENT</span><button className="icon-button sidebar-close" type="button" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기"><X size={20} /></button></div><nav aria-label="관리자 메뉴" onClick={() => setMenuOpen(false)}><p className="nav-group-label">WORKSPACE</p><NavLink to="/admin/dashboard"><LayoutDashboard size={19} />대시보드</NavLink><NavLink to="/admin/reports"><FileText size={19} />신고 목록</NavLink><NavLink to="/admin/map"><Map size={19} />신고 지도</NavLink><Link to="/admin/dashboard#statistics"><BarChart3 size={19} />통계<span className="nav-soon">준비중</span></Link></nav><div className="sidebar-bottom"><div className="sidebar-guide"><ShieldCheck size={22} /><strong>함께 만드는 안전한 거리</strong><p>신고 현황을 확인하고<br />시민의 불편을 해결해요.</p><Link to="/">서비스 홈페이지<ExternalLink size={14} /></Link></div><button className="sidebar-logout" type="button" disabled={loggingOut} onClick={() => void onLogout()}><LogOut size={18} />{loggingOut ? '로그아웃 중…' : '로그아웃'}</button></div></aside>{menuOpen && <button type="button" className="sidebar-overlay" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />}
    <div className="admin-main"><header className="admin-header"><div className="admin-breadcrumb"><button className="icon-button admin-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="관리자 메뉴 열기"><Menu size={21} /></button><Home size={16} /><ChevronRight size={14} /><span>{breadcrumb}</span></div><div className="admin-header-right"><span className="header-date"><CalendarDays size={16} />{today}</span><div className="admin-profile"><span className="profile-avatar">{session?.admin.name.slice(0, 1) || '관'}</span><div><strong>{session?.admin.name}</strong><small>{adminLabel}</small></div></div></div></header><main className="admin-content" id="admin-content">{error && <ErrorState message={error} />}<Outlet /></main><footer className="admin-footer">Parkick Admin<span>{isDevelopmentMock ? '개발 환경' : '관리자 서비스'}</span></footer></div>
  </div>;
}
