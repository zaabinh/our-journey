import type { Emoji, Reaction } from '../../domain/types';
import { ReactionIcon } from './ReactionIcon';

const choices = [
  { kind: '❤️', label: 'Yêu thích' },
  { kind: '😊', label: 'Vui quá' },
  { kind: 'moved', label: 'Xúc động' },
  { kind: '🎉', label: 'Bất ngờ' },
  { kind: 'care', label: 'Thương' },
] as const;
const legacyLabels: Partial<Record<Emoji, string>> = { like: 'Thích', sad: 'Buồn' };

// One-click bar: each emoji toggles the actor's reaction and shows its count.
export function ReactionBar({
  reactions,
  actor,
  canReact,
  pending,
  onSelect,
}: {
  reactions: Reaction[];
  actor: string;
  canReact: boolean;
  pending: boolean;
  onSelect: (kind: Emoji) => void;
}) {
  const selected = reactions.find((reaction) => reaction.userId === actor)?.emoji;
  const count = (kind: Emoji) => reactions.filter((reaction) => reaction.emoji === kind).length;
  return (
    <div className="reaction-bar" role="group" aria-label="Cảm xúc">
      {choices.map(({ kind, label }) => {
        const n = count(kind),
          name = n ? `${label}: ${n}` : label;
        if (canReact)
          return (
            <button
              key={kind}
              type="button"
              className="reaction-pill"
              aria-label={name}
              aria-pressed={selected === kind}
              title={label}
              disabled={pending}
              onClick={() => onSelect(kind)}
            >
              <ReactionIcon kind={kind} size={24} />
              {n > 0 && <span aria-hidden="true">{n}</span>}
            </button>
          );
        return n ? (
          <span
            className="reaction-pill"
            data-selected={selected === kind}
            key={kind}
            aria-label={name}
          >
            <ReactionIcon kind={kind} size={24} /> {n}
          </span>
        ) : null;
      })}
      {(['like', 'sad'] as const).map((kind) =>
        count(kind) ? (
          <span className="reaction-pill" data-selected={selected === kind} key={kind}>
            {legacyLabels[kind]} {count(kind)}
          </span>
        ) : null,
      )}
      {!canReact && !reactions.length && (
        <span className="reaction-hint">Chưa có cảm xúc nào cho kỷ niệm này</span>
      )}
    </div>
  );
}
