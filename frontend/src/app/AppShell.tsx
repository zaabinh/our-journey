import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useJourney } from './JourneyProvider';
import { UnsavedChangesGuard } from './useUnsavedChanges';
import { Button } from '../components/ui';

export function AppShell() {
  const { pathname } = useLocation(), { state, initialized, logout } = useJourney();
  const isPublic = ['/', '/login', '/signup', '/verify-email', '/forgot-password', '/reset-password'].includes(pathname);
  const homeRoute = pathname === '/';
  useEffect(() => { document.getElementById('main')?.focus(); }, [pathname]);
  if (initialized && !state && !isPublic) return <Navigate replace to="/login" state={{ from: pathname }} />;
  if (!initialized && !isPublic) return <main id="main" className="auth-loading"><p>กำลังตรวจสอบเซสชัน…</p></main>;
  return <><UnsavedChangesGuard/><a className="skip-link" href="#main" onClick={e => { e.preventDefault(); const main = document.getElementById('main'); main?.focus(); main?.scrollIntoView(); }}>Đến nội dung</a>
    <header className={`app-header${homeRoute ? ' app-header-public' : ''}`}><NavLink className="brand" to="/"><img src="/brand/love.png" alt="" width="44" height="44"/><span>Our Journey</span></NavLink>
      {state ? <><nav aria-label="Điều hướng chính"><NavLink to="/" end>Trang chủ</NavLink><NavLink to="/albums">Album</NavLink><NavLink to="/profile">Hồ sơ</NavLink></nav><Button variant="secondary" onClick={() => void logout()}>Đăng xuất</Button></> : <nav className="public-nav" aria-label="Tài khoản"><NavLink to="/login">Đăng nhập</NavLink><NavLink className="button primary" to="/signup">Đăng ký</NavLink></nav>}
    </header>
    <main id="main" tabIndex={-1}><div key={pathname} className="page-transition">{state || isPublic ? <Outlet/> : null}</div></main>
    {!homeRoute && <footer>Our Journey · Lưu những khoảnh khắc bên nhau</footer>}
  </>;
}
