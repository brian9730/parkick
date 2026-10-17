import { ArrowUpRight, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ParkickLogo } from './ui';

export function ParkickHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="public-header"><div className="container header-inner">
    <ParkickLogo />
    <nav className="desktop-nav" aria-label="주 메뉴"><a href="/#about">서비스 소개</a><a href="/#how-it-works">신고 방법</a><NavLink to="/report/status">처리결과 조회</NavLink><a href="/#faq">자주 묻는 질문</a></nav>
    <Link className="admin-login-link" to="/admin/login">관리자 로그인 <ArrowUpRight size={15} /></Link>
    <button className="icon-button mobile-menu-button" type="button" aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
  </div>{menuOpen && <nav id="mobile-nav" className="mobile-nav" aria-label="모바일 메뉴" onClick={() => setMenuOpen(false)}><a href="/#about">서비스 소개</a><a href="/#how-it-works">신고 방법</a><Link to="/report">신고하기</Link><Link to="/report/status">처리결과 조회</Link><Link to="/admin/login">관리자 로그인</Link></nav>}</header>;
}

export function PublicLayout() {
  return <><a className="skip-link" href="#main-content">본문 바로가기</a><ParkickHeader /><main id="main-content"><Outlet /></main><footer className="public-footer"><div className="container footer-inner"><div><ParkickLogo compact /><p>함께 만드는 더 안전한 보행 환경</p></div><div className="footer-meta"><span>Parkick · 공유 PM 주차 신고 플랫폼</span><span>개발용 서비스 · 지자체 전달 전</span></div></div></footer></>;
}
