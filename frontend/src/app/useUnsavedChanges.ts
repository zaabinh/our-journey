import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
const dirtyForms = new Set<symbol>(),
  listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useUnsavedChanges(dirty: boolean) {
  const id = useRef(Symbol('form'));
  useEffect(() => {
    const key = id.current;
    if (dirty) dirtyForms.add(key);
    else dirtyForms.delete(key);
    notify();
    return () => {
      dirtyForms.delete(key);
      notify();
    };
  }, [dirty]);
}
// One Router blocker for all forms; React Router supports one blocker at a time.
export function UnsavedChangesGuard() {
  const dirty = useSyncExternalStore(subscribe, () => dirtyForms.size > 0);
  const blocker = useBlocker(dirty);
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      [dirty],
    ),
  );
  useEffect(() => {
    const guard = (event: Event) => {
      if (dirty && !window.confirm('Bỏ các thay đổi chưa lưu để đổi danh tính?'))
        event.preventDefault();
    };
    window.addEventListener('journey:identity-change', guard);
    return () => window.removeEventListener('journey:identity-change', guard);
  }, [dirty]);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('Bỏ các thay đổi chưa lưu để rời trang?')) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  return null;
}
