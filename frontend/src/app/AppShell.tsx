import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { UnsavedChangesGuard } from './useUnsavedChanges';
import { IdentitySelector } from '../features/auth/IdentitySelector';
export function AppShell() {
  const { pathname } = useLocation();
  const homeRoute = pathname === '/';
  const albumDetailRoute = /^\/albums\/[^/]+$/.test(pathname);
  const memoryDetailRoute = /^\/albums\/[^/]+\/memories\/[^/]+$/.test(pathname);
  useEffect(() => {
    document.getElementById('main')?.focus();
  }, [pathname]);
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
      <header className="app-header">
        <NavLink className="brand" to="/">
          <img src="/brand/love.png" alt="" width="44" height="44" />
          <span>Our Journey</span>
        </NavLink>
        <nav aria-label="Điều hướng chính">
          <NavLink to="/" end>
            Trang chủ
          </NavLink>
          <NavLink to="/albums">Album</NavLink>
          <NavLink to="/profile">Hồ sơ</NavLink>
        </nav>
      </header>
      <div className="demo-banner">
        Demo local · Dữ liệu tổng hợp · Chưa có đăng nhập bảo mật hoặc đồng bộ thiết bị
      </div>
      {!homeRoute && !albumDetailRoute && !memoryDetailRoute && <IdentitySelector />}
      <main id="main" tabIndex={-1}>
        <div key={pathname} className="page-transition">
          <Outlet />
        </div>
      </main>
      <footer>Our Journey · Lưu những khoảnh khắc bên nhau</footer>
    </>
  );
}
