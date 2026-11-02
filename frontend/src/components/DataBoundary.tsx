import type { ReactNode } from 'react';
import { useJourney } from '../app/JourneyProvider';
import { Alert, Button, Skeleton } from './ui';
export function DataBoundary({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { state, error, refresh } = useJourney();
  if (error)
    return (
      <Alert>
        {error}
        <p>
          <Button onClick={() => void refresh().catch(() => undefined)}>Thử tải lại</Button>
        </p>
      </Alert>
    );
  if (!state) return fallback ?? <Skeleton />;
  return children;
}
