import type { CSSProperties, ReactNode } from 'react';
import './skeletons.css';

export function SkeletonBlock({
  className = '',
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div aria-hidden="true" className={`sk-block ${className}`.trim()} style={style} />;
}

function Root({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sk-sr">{label}</span>
      {children}
    </div>
  );
}

const bar = (height: number, width: string, marginTop?: number): CSSProperties => ({
  height,
  width,
  marginTop,
});

export function MemoryCardSkeleton({ ratio = '4 / 3' }: { ratio?: string }) {
  return (
    <div className="sk-card" aria-hidden="true">
      <SkeletonBlock className="sk-cover" style={{ aspectRatio: ratio }} />
      <div className="sk-body">
        <SkeletonBlock style={bar(24, '75%')} />
        <SkeletonBlock style={bar(16, '33%', 8)} />
        <SkeletonBlock style={bar(14, '100%')} />
        <SkeletonBlock style={bar(14, '80%')} />
        <div className="sk-pills">
          {[48, 48, 36].map((w, i) => (
            <SkeletonBlock key={i} style={bar(20, `${w}px`)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CardGridSkeleton({
  count = 6,
  variant,
}: {
  count?: number;
  variant: 'album' | 'memory';
}) {
  return (
    <Root label={variant === 'album' ? 'Đang tải album…' : 'Đang tải kỷ niệm…'} className="sk-grid">
      {Array.from({ length: count }, (_, i) => (
        <MemoryCardSkeleton key={i} ratio={variant === 'album' ? '16 / 10' : '4 / 3'} />
      ))}
    </Root>
  );
}

export function MemoryDetailSkeleton() {
  return (
    <Root label="Đang tải kỷ niệm…" className="sk-detail">
      <div className="sk-stack" aria-hidden="true">
        <SkeletonBlock style={{ ...bar(32, '120px'), borderRadius: 999 }} />
        <SkeletonBlock style={bar(32, '50%')} />
        <SkeletonBlock style={bar(16, '25%')} />
      </div>
      <div className="sk-cols" aria-hidden="true">
        <div className="sk-stack">
          <div className="sk-photos">
            <SkeletonBlock />
            <SkeletonBlock />
          </div>
          <div className="sk-reactions">
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonBlock key={i} />
            ))}
          </div>
          <div className="sk-card sk-body">
            {['100%', '95%', '90%', '60%'].map((w) => (
              <SkeletonBlock key={w} style={bar(14, w)} />
            ))}
          </div>
        </div>
        <div className="sk-card sk-body" style={{ gap: 16, alignContent: 'start' }}>
          {[0, 1].map((i) => (
            <div className="sk-row" key={i}>
              <SkeletonBlock className="sk-avatar" />
              <SkeletonBlock style={{ ...bar(56, '100%'), borderRadius: 14 }} />
            </div>
          ))}
        </div>
      </div>
    </Root>
  );
}
