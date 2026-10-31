import { Fragment } from 'react';
export function Story({ text }: { text: string }) {
  return (
    <p className="memory-story">
      {text.split(/(\*\*[^*]+\*\*|__[^_]+__|_[^_]+_)/g).map((part, i) => (
        <Fragment key={i}>
          {part.startsWith('**') && part.endsWith('**') ? (
            <strong>{part.slice(2, -2)}</strong>
          ) : part.startsWith('__') && part.endsWith('__') ? (
            <u>{part.slice(2, -2)}</u>
          ) : part.startsWith('_') && part.endsWith('_') ? (
            <em>{part.slice(1, -1)}</em>
          ) : (
            part
          )}
        </Fragment>
      ))}
    </p>
  );
}
