import type { Memory } from './types';

const display = new Intl.DateTimeFormat('vi-VN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "1 thg 10, 2026" for ISO days; free-text labels and unknown formats pass through. */
export function memoryDate({ date, dateLabel }: Pick<Memory, 'date' | 'dateLabel'>) {
  if (dateLabel?.trim()) return dateLabel.trim();
  // Build a local date from the parts so no timezone can shift the calendar day.
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!parts) return date || 'Chưa ghi rõ ngày';
  return display.format(new Date(+parts[1], +parts[2] - 1, +parts[3]));
}
