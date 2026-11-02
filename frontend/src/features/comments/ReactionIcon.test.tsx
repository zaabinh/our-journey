import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ReactionIcon } from './ReactionIcon';

test('all five reactions render the same hidden SVG frame', () => {
  for (const kind of ['❤️', '😊', 'moved', '🎉', 'care'] as const) {
    const { unmount } = render(<ReactionIcon kind={kind} />);
    const icon = document.querySelector('svg');
    expect(icon?.getAttribute('viewBox')).toBe('0 0 48 48');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByText(kind)).toBeNull();
    unmount();
  }
});
