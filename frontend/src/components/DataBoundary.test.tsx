import type { ContextType } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JourneyRepository } from '../domain/types';
import { emptyStore } from '../data/local/fixture';
import { JourneyContext } from '../app/JourneyProvider';
import { DataBoundary } from './DataBoundary';
afterEach(cleanup);
test('loading, read failure and retry precede the loaded content', async () => {
  const refresh = vi.fn(async () => undefined);
  const value: NonNullable<ContextType<typeof JourneyContext>> = {
    repo: {} as JourneyRepository,
    initialized: true,
    actor: '',
    error: '',
    busy: false,
    refresh,
    perform: (task) => task(),
    dispatch: async () => undefined,
    select: async () => undefined,
    create: async () => 'fixture',
    login: async () => undefined,
    register: async () => undefined,
    logout: async () => undefined,
  };
  const wrap = (next: typeof value) => (
    <JourneyContext.Provider value={next}>
      <DataBoundary>
        <p>Loaded fixture</p>
      </DataBoundary>
    </JourneyContext.Provider>
  );
  const view = render(wrap(value));
  expect(screen.getByRole('status').textContent).toBe('Đang tải…');
  view.rerender(wrap({ ...value, error: 'Synthetic read failure' }));
  expect(screen.getByRole('alert').textContent).toContain('Synthetic read failure');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Thử tải lại' }));
  expect(refresh).toHaveBeenCalledTimes(1);
  view.rerender(wrap({ ...value, state: emptyStore() }));
  expect(screen.getByText('Loaded fixture')).toBeTruthy();
});
