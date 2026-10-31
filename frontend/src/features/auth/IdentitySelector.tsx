import { useContext, useState } from 'react';
import { JourneyContext, errorMessage } from '../../app/JourneyProvider';
export function IdentitySelector({ className = '' }: { className?: string }) {
  const journey = useContext(JourneyContext),
    [error, setError] = useState('');
  if (!journey?.state) return null;
  return (
    <div className={`identity ${className}`}>
      <label htmlFor="demo-identity">Danh tính demo</label>
      <select
        id="demo-identity"
        value={journey.actor}
        disabled={journey.busy}
        onChange={(e) => {
          setError('');
          void journey.select(e.target.value).catch((e) => setError(errorMessage(e)));
        }}
      >
        {journey.state.users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
