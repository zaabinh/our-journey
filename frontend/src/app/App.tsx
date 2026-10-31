import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { Landing } from '../routes/Landing';
import { AlbumsPage } from '../features/albums/AlbumsPage';
import { AlbumPage } from '../features/albums/AlbumPage';
import { SettingsPage } from '../features/albums/SettingsPage';
import { MemoryPage } from '../features/memories/MemoryPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { JoinPage } from '../features/members/JoinPage';
import { LoginPage, SignupPage } from '../features/auth/AccountPages';
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Landing />} />
        <Route path="/albums" element={<AlbumsPage />} />
        <Route path="/albums/:albumId" element={<AlbumPage />} />
        <Route path="/albums/:albumId/settings" element={<SettingsPage />} />
        <Route path="/albums/:albumId/memories/:memoryId" element={<MemoryPage />} />
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        {[
          ['home.html', '/'],
          ['index.html', '/'],
          ['album.html', '/albums'],
          ['login_page.html', '/login'],
          ['signup_page.html', '/signup'],
          ['profile.html', '/profile'],
        ].map(([from, to]) => (
          <Route key={from} path={`/${from}`} element={<Navigate replace to={to} />} />
        ))}
        <Route path="*" element={<h1>Không tìm thấy trang</h1>} />
      </Route>
    </Routes>
  );
}
