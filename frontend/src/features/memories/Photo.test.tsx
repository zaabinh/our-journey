import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import { BlobImage, coverSizes, thumbnailWidth } from './Photo';

const remote = (width: number, height: number) => ({
  id: 'p',
  blob: new Blob(),
  checksum: 'c',
  src: 'https://cdn.test/full.jpg',
  thumbnailSrc: 'https://cdn.test/thumb.jpg',
  width,
  height,
});

test('thumbnail width matches the server 640px bounding box', () => {
  expect(thumbnailWidth(4000, 3000)).toBe(640);
  expect(thumbnailWidth(3000, 4000)).toBe(480);
  expect(thumbnailWidth(500, 300)).toBe(500);
});

test('wide photos cropped into a narrower frame request proportionally more pixels', () => {
  const slots: [string, string][] = [
    ['(max-width: 480px)', '92vw'],
    ['', '300px'],
  ];
  expect(coverSizes(remote(3000, 4000), 1, slots)).toBe(
    '(max-width: 480px) calc(92vw * 1.000), calc(300px * 1.000)',
  );
  expect(coverSizes(remote(4000, 2000), 1, slots)).toContain('calc(300px * 2.000)');
});

test('grid image offers thumbnail and original with real widths', () => {
  const { container } = render(<BlobImage photo={remote(4000, 3000)} alt="a" sizes="50vw" />);
  const img = container.querySelector('img')!;
  expect(img.getAttribute('srcset')).toBe(
    'https://cdn.test/thumb.jpg 640w, https://cdn.test/full.jpg 4000w',
  );
  expect(img.getAttribute('sizes')).toBe('50vw');
  expect(img.getAttribute('src')).toBe('https://cdn.test/thumb.jpg');
});
