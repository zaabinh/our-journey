import type { Emoji } from '../../domain/types';

export function ReactionIcon({
  kind,
  size = 28,
  className,
}: {
  kind: Exclude<Emoji, 'like' | 'sad'>;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="24" cy="24" r="20" fill="var(--surface)" stroke="var(--text)" strokeWidth="1.8" />
      <circle cx="12.5" cy="29" r="3" fill="var(--card)" opacity=".8" />
      <circle cx="35.5" cy="29" r="3" fill="var(--card)" opacity=".8" />
      <g stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {kind === '❤️' && (
          <>
            <path d="M16 21v1m13-1v1M17 30c3.4 4.2 10.6 4.2 14 0" />
            <path
              d="M32 11c1.8-2.8 6-1.5 6 1.4 0 2.3-3.2 4.2-6 6-2.8-1.8-6-3.7-6-6 0-2.9 4.2-4.2 6-1.4Z"
              fill="var(--card)"
            />
          </>
        )}
        {kind === '😊' && (
          <>
            <path
              d="M14 22c1.7-2.8 4.5-2.8 6 0m8 0c1.7-2.8 4.5-2.8 6 0M16 29c2 8 14 8 16 0Z"
              fill="var(--card)"
            />
          </>
        )}
        {kind === 'moved' && (
          <>
            <path d="M14 21c2-2 4-2 6 0m8 0c2-2 4-2 6 0M18 31c3 2 9 2 12 0" />
            <path d="M33 23c3 3 3 6 0 7-3-1-3-4 0-7Z" fill="var(--card)" />
            <circle cx="17" cy="21" r="1" fill="var(--text)" stroke="none" />
            <circle cx="31" cy="21" r="1" fill="var(--text)" stroke="none" />
          </>
        )}
        {kind === '🎉' && (
          <>
            <circle cx="17" cy="21" r="2.2" fill="var(--text)" />
            <circle cx="31" cy="21" r="2.2" fill="var(--text)" />
            <ellipse cx="24" cy="31" rx="4" ry="5" fill="var(--card)" />
          </>
        )}
        {kind === 'care' && (
          <>
            <path d="M14 21c2 2 4 2 6 0m8 0c2 2 4 2 6 0M18 30c3 2.5 9 2.5 12 0" />
          </>
        )}
      </g>
    </svg>
  );
}
