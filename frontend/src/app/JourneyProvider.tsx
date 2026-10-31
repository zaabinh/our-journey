import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Command, Id, JourneyRepository, Store } from '../domain/types';
import { LocalRepository } from '../data/local/repository';
const repository = new LocalRepository();
interface Journey {
  repo: JourneyRepository;
  state?: Store;
  actor: Id;
  error: string;
  busy: boolean;
  refresh: () => Promise<void>;
  perform: <T>(task: () => Promise<T>) => Promise<T>;
  dispatch: (command: Command) => Promise<Id | undefined>;
  select: (id: Id) => Promise<void>;
  create: (name: string, email: string) => Promise<Id>;
}
export const JourneyContext = createContext<Journey | null>(null);
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Không thể hoàn tất thao tác. Thử lại.';
export function JourneyProvider({
  children,
  repo = repository,
}: {
  children: ReactNode;
  repo?: JourneyRepository;
}) {
  const [state, setState] = useState<Store>(),
    [actor, setActor] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState(0);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    try {
      const identity = await repo.identity(),
        next = await repo.read(identity.active);
      if (current === request.current) {
        setActor(identity.active);
        setState(next);
        setError('');
      }
    } catch (e) {
      if (current === request.current) {
        setError(errorMessage(e));
        setState(undefined);
      }
      throw e;
    }
  }, [repo]);
  useEffect(() => {
    void refresh().catch(() => undefined);
    return () => {
      request.current++;
    };
  }, [refresh]);
  async function mutate<T>(task: () => Promise<T>) {
    setPending((p) => p + 1);
    try {
      const result = await task();
      await refresh();
      return result;
    } finally {
      setPending((p) => p - 1);
    }
  }
  return (
    <JourneyContext.Provider
      value={{
        repo,
        state,
        actor,
        error,
        busy: pending > 0,
        refresh,
        perform: mutate,
        dispatch: (cmd) => mutate(() => repo.dispatch(actor, cmd)),
        select: (id) =>
          window.dispatchEvent(new Event('journey:identity-change', { cancelable: true }))
            ? mutate(() => repo.selectIdentity(id))
            : Promise.resolve(),
        create: (name, email) => mutate(() => repo.createIdentity(name, email)),
      }}
    >
      {children}
    </JourneyContext.Provider>
  );
}
export function useJourney() {
  const value = useContext(JourneyContext);
  if (!value) throw Error('JourneyProvider is required.');
  return value;
}
export function useAction() {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const running = useRef(false);
  async function run(task: () => Promise<unknown>) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return { pending, error, run, clear: () => setError('') };
}
