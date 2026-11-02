import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useJourney } from './JourneyProvider';
import { UnsavedChangesGuard } from './useUnsavedChanges';
import { Button, Skeleton } from '../components/ui';
import { IdentitySelector } from '../features/auth/IdentitySelector';
import { Footer } from './Footer';

export function AppShell() {
  const { pathname } = useLocation(),
    { state, initialized, logout, repo } = useJourney();
  const isPublic = [
    '/',
    '/login',
    '/signup',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
  ].includes(pathname);
  const homeRoute = pathname === '/',
    [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    document.getElementById('main')?.focus();
  }, [pathname]);
  // Landing header is transparent over the hero and turns to frosted glass once scrolled.
  useEffect(() => {
    if (!homeRoute) return;
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [homeRoute]);
  if (initialized && !state && !isPublic)
    return <Navigate replace to="/login" state={{ from: pathname }} />;
  if (!initialized && !isPublic)
    return (
      <main id="main" className="auth-loading">
        <Skeleton label="Đang tải dữ liệu của bạn…" />
      </main>
    );
  return (
    <>
      <UnsavedChangesGuard />
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById('main');
          main?.focus();
          main?.scrollIntoView();
        }}
      >
        Đến nội dung
      </a>
      <header
        className={`app-header${homeRoute ? ' app-header-public' : ''}${homeRoute && scrolled ? ' is-scrolled' : ''}`}
      >
        <NavLink className="brand" to="/">
          <img src="/brand/love.png" alt="" width="44" height="44" />
          <span>Our Journey</span>
        </NavLink>
        {state ? (
          <>
            <nav aria-label="Điều hướng chính">
              <NavLink to="/" end>
                Trang chủ
              </NavLink>
              <NavLink to="/albums">Album</NavLink>
              <NavLink to="/profile">Hồ sơ</NavLink>
            </nav>
            {repo.mode === 'local' && !homeRoute && <IdentitySelector />}
            <Button variant="secondary" onClick={() => void logout()}>
              Đăng xuất
            </Button>
          </>
        ) : (
          <nav className="public-nav" aria-label="Tài khoản">
            <NavLink to="/login">Đăng nhập</NavLink>
            <NavLink className="button primary" to="/signup">
              Đăng ký
            </NavLink>
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1}>
        <div key={pathname} className="page-transition">
          {state || isPublic ? <Outlet /> : null}
        </div>
      </main>
      <Footer />
    </>
  );
}
