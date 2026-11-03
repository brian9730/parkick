import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui';
import { CollectionMode } from '../../features/admin/CollectionMode';
import './DashboardPage.css';

export function CollectionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const pageValue = Number(searchParams.get('page'));
  const page = Number.isSafeInteger(pageValue) && pageValue >= 1 && pageValue <= 10_000 ? pageValue : 1;
  const focusedPublicId = searchParams.get('focus');
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice] = useState(() => {
    const message = (location.state as { collectionStatusMessage?: unknown } | null)?.collectionStatusMessage;
    return typeof message === 'string' ? message : '';
  });
  const noticeCleared = useRef(false);

  useEffect(() => {
    if (!notice || noticeCleared.current) return;
    noticeCleared.current = true;
    void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, navigate, notice]);

  const changePage = (nextPage: number) => {
    setSearchParams(current => {
      const updated = new URLSearchParams(current);
      if (nextPage > 1) updated.set('page', String(nextPage));
      else updated.delete('page');
      updated.delete('focus');
      return updated;
    });
  };

  const focusReport = (publicId: string) => {
    setSearchParams(current => {
      const updated = new URLSearchParams(current);
      updated.set('focus', publicId);
      return updated;
    }, { replace: true });
  };

  return <div className="admin-dashboard-page">
    <div className="admin-page-heading"><div><h1>수거 대상</h1><p>현재 위치에서 가까운 신고부터 확인하세요.</p></div><Button variant="secondary" onClick={() => setRefreshKey(value => value + 1)}><RefreshCw size={16} />새로고침</Button></div>
    {notice && <p className="collection-return-notice" role="status">{notice}</p>}
    <CollectionMode refreshKey={refreshKey} page={page} focusedPublicId={focusedPublicId} onPageChange={changePage} onFocusChange={focusReport} />
  </div>;
}
