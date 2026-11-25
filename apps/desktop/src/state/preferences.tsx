// Display preferences, persisted through the journal API. The value exposed is
// always the one the journal acknowledged; updates run one at a time so quick
// successive changes never overwrite each other. When the journal's preferences
// cannot be read, the defaults are shown but never saved over them: a change reads
// them again first, and only an explicit reset replaces them.

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
import { toCommandError, useApi } from '../api/client';
import type { CommandError, Preferences } from '../api/types';
import { DEFAULT_PREFERENCES, visibilityFor, type Visibility } from '../domain/preferences';
import { applyAppearance } from './appearance';

type PreferenceChanges=Partial<Preferences> | ((current:Preferences)=>Partial<Preferences>);
export interface PreferencesContextValue {
  preferences: Preferences;
  /** Gentle view composed with the per-surface choices. */
  visibility: Visibility;
  /**
   * Persists a change; resolves false (and sets error) when it was not saved. While the
   * stored preferences cannot be read, it reads them again first and saves nothing
   * unless that succeeds.
   */
  update(changes: PreferenceChanges): Promise<boolean>;
  /** True while the journal's stored preferences cannot be read; the defaults are shown instead. */
  unreadable: boolean;
  /** Replaces the stored preferences with the defaults; resolves false (and sets error) when that fails. */
  reset(): Promise<boolean>;
  error: CommandError | null;
  clearError(): void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children, fallback = null }: { children?: ReactNode; fallback?: ReactNode }) {
  const api = useApi();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);
  const latest = useRef<Preferences | null>(null);
  // Queued writes read this rather than the state of the render that queued them.
  const latestUnreadable = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /** Shows preferences that the journal returned or acknowledged. */
  const accept = useCallback((next: Preferences) => {
    latest.current = next;
    latestUnreadable.current = false;
    setPreferences(next);
    setUnreadable(false);
  }, []);

  useEffect(() => {
    let active = true;
    api.getPreferences().then(
      (loaded) => {
        if (!active) return;
        accept(loaded);
      },
      (caught: unknown) => {
        if (!active) return;
        // Show the defaults and say that preferences could not be read. The defaults are
        // never saved over the stored preferences: see update and reset.
        latest.current = { ...DEFAULT_PREFERENCES };
        latestUnreadable.current = true;
        setPreferences(latest.current);
        setUnreadable(true);
        setError(toCommandError(caught));
      },
    );
    return () => {
      active = false;
    };
  }, [api, accept]);

  const theme = preferences?.theme;
  const reduceMotion = preferences?.reduceMotion;
  const textScale = preferences?.textScale;
  useLayoutEffect(() => {
    if (theme === undefined || reduceMotion === undefined || textScale === undefined) return;
    applyAppearance({ theme, reduceMotion, textScale });
  }, [theme, reduceMotion, textScale]);

  /** Runs a write after the ones already queued. */
  const enqueue = useCallback((run: () => Promise<boolean>): Promise<boolean> => {
    const result = queue.current.then(run, run);
    queue.current = result;
    return result;
  }, []);

  const update = useCallback(
    (changes: PreferenceChanges): Promise<boolean> =>
      enqueue(async () => {
        let base = latest.current;
        if (!base) return false;
        if (latestUnreadable.current) {
          // base holds only the defaults: saving it would replace the stored time zone, theme
          // and every other choice. Read the stored preferences again; save nothing if that fails.
          try {
            base = await api.getPreferences();
          } catch (caught) {
            setError(toCommandError(caught));
            return false;
          }
          accept(base);
          setError(null);
        }
        try {
          const saved = await api.setPreferences({ ...base, ...(typeof changes === 'function' ? changes(base) : changes) });
          accept(saved);
          setError(null);
          return true;
        } catch (caught) {
          setError(toCommandError(caught));
          return false;
        }
      }),
    [api, accept, enqueue],
  );

  const reset = useCallback(
    (): Promise<boolean> =>
      enqueue(async () => {
        try {
          accept(await api.setPreferences({ ...DEFAULT_PREFERENCES }));
          setError(null);
          return true;
        } catch (caught) {
          setError(toCommandError(caught));
          return false;
        }
      }),
    [api, accept, enqueue],
  );

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () =>
      preferences
        ? { preferences, visibility: visibilityFor(preferences), update, unreadable, reset, error, clearError }
        : null,
    [preferences, update, unreadable, reset, error, clearError],
  );

  if (!value) return <>{fallback}</>;
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside <PreferencesProvider>.');
  return value;
}

/** Shortcut for surfaces that only need to know what to show. */
export function useVisibility(): Visibility {
  return usePreferences().visibility;
}
