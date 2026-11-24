// Display preferences, persisted through the journal API. The value exposed is
// always the one the journal acknowledged; updates run one at a time so quick
// successive changes never overwrite each other.

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
  /** Persists a change; resolves false (and sets error) when it was not saved. */
  update(changes: PreferenceChanges): Promise<boolean>;
  error: CommandError | null;
  clearError(): void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children, fallback = null }: { children?: ReactNode; fallback?: ReactNode }) {
  const api = useApi();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [error, setError] = useState<CommandError | null>(null);
  const latest = useRef<Preferences | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    api.getPreferences().then(
      (loaded) => {
        if (!active) return;
        latest.current = loaded;
        setPreferences(loaded);
      },
      (caught: unknown) => {
        if (!active) return;
        // Keep writing available with defaults and say that preferences could not be read.
        latest.current = { ...DEFAULT_PREFERENCES };
        setPreferences(latest.current);
        setError(toCommandError(caught));
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  const theme = preferences?.theme;
  const reduceMotion = preferences?.reduceMotion;
  const textScale = preferences?.textScale;
  useLayoutEffect(() => {
    if (theme === undefined || reduceMotion === undefined || textScale === undefined) return;
    applyAppearance({ theme, reduceMotion, textScale });
  }, [theme, reduceMotion, textScale]);

  const update = useCallback(
    (changes: PreferenceChanges): Promise<boolean> => {
      const run = async () => {
        const base = latest.current;
        if (!base) return false;
        try {
          const saved = await api.setPreferences({ ...base, ...(typeof changes === 'function' ? changes(base) : changes) });
          latest.current = saved;
          setPreferences(saved);
          setError(null);
          return true;
        } catch (caught) {
          setError(toCommandError(caught));
          return false;
        }
      };
      const result = queue.current.then(run, run);
      queue.current = result;
      return result;
    },
    [api],
  );

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo(
    () =>
      preferences
        ? { preferences, visibility: visibilityFor(preferences), update, error, clearError }
        : null,
    [preferences, update, error, clearError],
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
