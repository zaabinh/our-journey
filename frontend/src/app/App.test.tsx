import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { JourneyProvider } from './JourneyProvider';
import { App } from './App';
afterEach(cleanup);
const renderApp = (initialEntries: string[] = ['/']) =>
  render(
    <JourneyProvider>
      <RouterProvider
        router={createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries })}
      />
    </JourneyProvider>,
  );
test('renders public sign-in and registration actions without local demo messaging', async () => {
  renderApp();
  expect(
    await screen.findByRole('link', { name: /Bắt đầu lưu giữ hành trình của bạn/ }),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Đã có tài khoản' })).toBeTruthy();
  expect(screen.queryByText(/demo local|danh tính demo|Một lời nhắn nhỏ/i)).toBeNull();
});
test('requires authentication for application routes', async () => {
  renderApp(['/missing']);
  expect(await screen.findByRole('heading', { name: 'Chào mừng bạn trở lại' })).toBeTruthy();
});
test('registration requires matching confirmation and supports showing both passwords', async () => {
  renderApp(['/signup']);
  const confirm = screen.getByLabelText('Xác nhận mật khẩu') as HTMLInputElement;
  fireEvent.change(screen.getByLabelText('Mật khẩu', { exact: true }), {
    target: { value: 'Example-password-2026' },
  });
  fireEvent.change(confirm, { target: { value: 'Different-password-2026' } });
  fireEvent.blur(confirm);
  expect(screen.getByText('Mật khẩu xác nhận không khớp')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Hiện xác nhận mật khẩu' }));
  expect(confirm.type).toBe('text');
  fireEvent.change(confirm, { target: { value: 'Example-password-2026' } });
  expect(screen.queryByText('Mật khẩu xác nhận không khớp')).toBeNull();
});
