import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CardGridSkeleton, MemoryDetailSkeleton } from './skeletons';
afterEach(cleanup);
test.each([
  [<CardGridSkeleton variant="album" />, 'Đang tải album…'],
  [<CardGridSkeleton variant="memory" count={2} />, 'Đang tải kỷ niệm…'],
  [<MemoryDetailSkeleton />, 'Đang tải kỷ niệm…'],
])('skeleton announces its label', (ui, label) => {
  render(ui);
  const status = screen.getByRole('status');
  expect(status.textContent).toContain(label);
  expect(status.getAttribute('aria-busy')).toBe('true');
});
