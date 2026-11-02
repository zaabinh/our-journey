import { expect, test } from 'vitest';
import { memoryDate } from './date';

test('formats ISO days in Vietnamese and keeps free-text labels', () => {
  expect(memoryDate({ date: '2026-11-02' })).toBe('2 thg 11, 2026');
  expect(memoryDate({ date: '2026-01-01' })).toBe('1 thg 1, 2026');
  expect(memoryDate({ date: '2026-11-02', dateLabel: ' Mùa hè 2019 ' })).toBe('Mùa hè 2019');
  expect(memoryDate({ date: 'khoảng 2010' })).toBe('khoảng 2010');
  expect(memoryDate({ date: '' })).toBe('Chưa ghi rõ ngày');
});
