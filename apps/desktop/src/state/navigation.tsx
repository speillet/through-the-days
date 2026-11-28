// Which view the main region shows. Later milestones add views here only when
// they are delivered; unavailable ones are never navigable. A view whose input is
// not saved yet keeps itself open with a leave guard (useLeaveGuard), whichever
// control asked for another view or for the same one again.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type View =
  'today' | 'trash' | 'settings' | 'calendar' | 'journal' | 'book' | 'trends' | 'weekly' | 'path';

export type SettingsSection =
  'appearance' | 'writing' | 'timeZone' | 'gentle' | 'backups' | 'privacy' | 'erase';

export interface NavigateOptions {
  /** With the settings view: scroll to and focus this section's heading. */
  section?: SettingsSection;
  date?: string;
  slot?: import('../api/types').Slot;
}

/** Asked before the open view is left or opened again; false keeps it, for example while its input is not saved. */
export type LeaveGuard = () => boolean | Promise<boolean>;

export interface NavigationContextValue {
  view: View;
  settingsSection: SettingsSection | null;
  /** Increments on every navigation that happens, so repeating a request is noticed. */
  requestId: number;
  target: NavigateOptions | null;
  /**
   * Opens a view, or the open one again. Without a leave guard this happens at once;
   * otherwise once every guard allows it, and not at all when one keeps the open view.
   */
  navigate(view: View, options?: NavigateOptions): void;
  /** Adds a leave guard of the open view; call the returned function when that view closes. */
  addLeaveGuard(guard: LeaveGuard): () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  children,
  initialView = 'today',
}: {
  children?: ReactNode;
  initialView?: View;
}) {
  const [state, setState] = useState<{
    view: View;
    settingsSection: SettingsSection | null;
    requestId: number;
    target: NavigateOptions | null;
  }>({
    view: initialView,
    settingsSection: null,
    requestId: 0,
    target: null,
  });
  const guards = useRef(new Set<LeaveGuard>());
  // Counts navigate calls: a request that waits for a guard gives way to a newer one.
  const requests = useRef(0);

  const addLeaveGuard = useCallback((guard: LeaveGuard) => {
    guards.current.add(guard);
    return () => {
      guards.current.delete(guard);
    };
  }, []);

  const navigate = useCallback((view: View, options: NavigateOptions = {}) => {
    const open = () =>
      setState((current) => ({
        view,
        settingsSection: view === 'settings' ? (options.section ?? null) : null,
        requestId: current.requestId + 1,
        target: options,
      }));
    const request = ++requests.current;
    const asked = Array.from(guards.current);
    if (asked.length === 0) {
      open();
      return;
    }
    void (async () => {
      for (const guard of asked) {
        try {
          if (!(await guard())) return;
        } catch {
          // A guard that fails keeps its view, so no input is left behind by mistake.
          return;
        }
      }
      if (requests.current === request) open();
    })();
  }, []);

  const value = useMemo(() => ({ ...state, navigate, addLeaveGuard }), [state, navigate, addLeaveGuard]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation must be used inside <NavigationProvider>.');
  return value;
}

/**
 * Keeps the calling view open while `guard` resolves false. Navigation asks the latest
 * guard before it opens another view, or this one again.
 */
export function useLeaveGuard(guard: LeaveGuard): void {
  const { addLeaveGuard } = useNavigation();
  const latest = useRef(guard);
  useLayoutEffect(() => {
    latest.current = guard;
  });
  useEffect(() => addLeaveGuard(() => latest.current()), [addLeaveGuard]);
}
