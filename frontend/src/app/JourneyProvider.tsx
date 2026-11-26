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
import { ApiError, HttpRepository } from '../data/http/repository';
const repository: JourneyRepository =
  import.meta.env.MODE === 'test' || import.meta.env.VITE_DATA_MODE === 'local'
    ? new LocalRepository()
    : new HttpRepository();
interface Journey {
  repo: JourneyRepository;
  state?: Store;
  initialized: boolean;
  actor: Id;
  error: string;
  busy: boolean;
  refresh: () => Promise<void>;
  perform: <T>(task: () => Promise<T>) => Promise<T>;
  dispatch: (command: Command) => Promise<Id | undefined>;
  select: (id: Id) => Promise<void>;
  create: (name: string, email: string) => Promise<Id>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    username: string;
    display_name: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}
export const JourneyContext = createContext<Journey | null>(null);
export const errorMessage = (e: unknown) =>
  e instanceof TypeError
    ? 'Không thể kết nối máy chủ. Vui lòng thử lại.'
    : e instanceof Error
      ? e.message
      : 'Không thể hoàn tất thao tác. Thử lại.';
export function JourneyProvider({
  children,
  repo = repository,
}: {
  children: ReactNode;
  repo?: JourneyRepository;
}) {
  const [state, setState] = useState<Store>(),
    [initialized, setInitialized] = useState(false),
    [actor, setActor] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState(0);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    try {
      if (repo.mode === 'remote' && 'invalidate' in repo)
        (repo as JourneyRepository & { invalidate: () => void }).invalidate();
      const identity = await repo.identity(),
        next = await repo.read(identity.active);
      if (current === request.current) {
        setActor(identity.active);
        setState(next);
        setInitialized(true);
        setError('');
      }
    } catch (e) {
      if (current === request.current) {
        setError(errorMessage(e));
        if (e instanceof ApiError && e.status === 401) {
          setState(undefined);
          setActor('');
        }
        setInitialized(true);
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
  useEffect(() => {
    if (repo.mode !== 'remote' || !actor) return;
    const revalidate = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => undefined);
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    const timer = window.setInterval(revalidate, 30_000);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
      window.clearInterval(timer);
    };
  }, [repo, refresh, actor]);
  async function mutate<T>(task: () => Promise<T>) {
    setPending((p) => p + 1);
    try {
      const result = await task();
      await refresh();
      return result;
    } catch (e) {
      await refresh().catch(() => undefined);
      throw e;
    } finally {
      setPending((p) => p - 1);
    }
  }
  return (
    <JourneyContext.Provider
      value={{
        repo,
        state,
        initialized,
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
        login: async (identifier, password) => {
          const auth = repo as JourneyRepository & {
            login?: (identifier: string, password: string) => Promise<void>;
          };
          if (!auth.login) throw Error('Đăng nhập không khả dụng.');
          await auth.login(identifier, password);
          await refresh();
        },
        register: async (input) => {
          const auth = repo as JourneyRepository & {
            register?: (input: {
              email: string;
              username: string;
              display_name: string;
              password: string;
            }) => Promise<void>;
          };
          if (!auth.register) throw Error('Đăng ký không khả dụng.');
          await auth.register(input);
        },
        logout: async () => {
          const auth = repo as JourneyRepository & { logout?: () => Promise<void> };
          if (!auth.logout) throw Error('Đăng xuất không khả dụng.');
          await auth.logout();
          setState(undefined);
          setActor('');
          setError('');
        },
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
    [error, setError] = useState(''),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const running = useRef(false);
  async function run(task: () => Promise<unknown>) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError('');
    setFieldErrors({});
    try {
      await task();
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError) setFieldErrors(e.fields);
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return {
    pending,
    error,
    fieldErrors,
    run,
    clear: () => {
      setError('');
      setFieldErrors({});
    },
  };
}
