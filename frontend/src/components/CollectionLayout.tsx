import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../features/admin/auth-context';
import { ErrorState } from './ui';
import '../features/admin/reports.css';
import './CollectionLayout.css';

export function CollectionLayout() {
  const { session, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');

  const onLogout = async () => {
    setLoggingOut(true);
    setError('');
    try { await logout(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '로그아웃하지 못했습니다.'); }
    finally { setLoggingOut(false); }
  };

  return <div className="admin-layout collection-shell">
    <a className="skip-link" href="#collection-content">본문 바로가기</a>
    <header className="admin-header collection-shell-header">
      <Link className="brand admin-brand" to="/collect" aria-label="파킥 수거 목록"><img src="/assets/parkick_logo_text_noback.png" alt="Parkick" /></Link>
      <div className="collection-shell-account"><span><strong>{session?.admin.name}</strong><small>수거 담당자</small></span><button type="button" className="collection-shell-logout" disabled={loggingOut} onClick={() => void onLogout()}><LogOut size={16} />{loggingOut ? '로그아웃 중…' : '로그아웃'}</button></div>
    </header>
    <main className="admin-content collection-shell-main" id="collection-content">{error && <ErrorState message={error} />}<Outlet /></main>
  </div>;
}
