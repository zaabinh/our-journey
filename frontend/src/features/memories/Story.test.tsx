import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Story } from './Story';
afterEach(cleanup);
test('limited legacy formatting preserves line breaks and escapes arbitrary HTML', () => {
  const { container } = render(
    <Story text={'**bold** _italic_ __underlined__\n<img src=x onerror=alert(1)> 🌷'} />,
  );
  expect(container.querySelector('strong')?.textContent).toBe('bold');
  expect(container.querySelector('em')?.textContent).toBe('italic');
  expect(container.querySelector('u')?.textContent).toBe('underlined');
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('\n<img src=x onerror=alert(1)> 🌷');
});
