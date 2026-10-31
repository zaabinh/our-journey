import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
afterEach(cleanup);
test('identifies the local demo and renders a missing route', () => {
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <App /> }])} />);
  expect(screen.getByText(/Dữ liệu tổng hợp/)).toBeTruthy();
  cleanup();
  render(
    <RouterProvider
      router={createMemoryRouter([{ path: '*', element: <App /> }], {
        initialEntries: ['/missing'],
      })}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeTruthy();
});
