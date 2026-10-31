import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { JourneyProvider } from './JourneyProvider';
import { App } from './App';
afterEach(cleanup);
const renderApp = (initialEntries: string[] = ['/']) => render(<JourneyProvider><RouterProvider router={createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries })} /></JourneyProvider>);
test('renders public sign-in and registration actions without local demo messaging', async () => {
  renderApp();
  expect(await screen.findByRole('link', { name: /Bắt đầu lưu giữ hành trình của bạn/ })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Đã có tài khoản' })).toBeTruthy();
  expect(screen.queryByText(/demo local|danh tính demo|Một lời nhắn nhỏ/i)).toBeNull();
});
test('requires authentication for application routes', async () => {
  renderApp(['/missing']);
  expect(await screen.findByRole('heading', { name: 'Chào mừng bạn trở lại' })).toBeTruthy();
});
