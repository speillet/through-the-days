// Today's journal date in the configured time zone. The journal is authoritative;
// the value refreshes every minute, when the window regains focus, when the page is
// shown again and after the time zone changes, so an app left open overnight moves
// on to the new date. A window can stay focused while the Mac sleeps: waking then
// sends no focus event, and the minute timer can take up to a minute to run again.
// Entries that are already open keep their own chosen date.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useApi } from '../api/client';
import { todayIn } from '../domain/dates';
import { usePreferences } from './preferences';

export const TODAY_REFRESH_MS = 60_000;

export interface TodayContextValue {
  /** YYYY-MM-DD */
  today: string;
  refresh(): Promise<void>;
}

const TodayContext = createContext<TodayContextValue | null>(null);

function localToday(timeZone: string): string {
  try {
    return todayIn(timeZone);
  } catch {
    return todayIn('UTC');
  }
}

/** Renders its children once the journal has answered, so no view starts from a guessed date. */
export function TodayProvider({
  children,
  intervalMs = TODAY_REFRESH_MS,
  fallback = null,
}: {
  children?: ReactNode;
  intervalMs?: number;
  fallback?: ReactNode;
}) {
  const api = useApi();
  const { timeZone } = usePreferences().preferences;
  const [today, setToday] = useState<string | null>(null);
  const zone = useRef(timeZone);
  useEffect(() => {
    zone.current = timeZone;
  }, [timeZone]);

  const refresh = useCallback(async () => {
    try {
      const value = await api.today();
      setToday(value);
    } catch {
      // Keep the last known date; only the very first answer falls back to the local clock.
      setToday((current) => current ?? localToday(zone.current));
    }
  }, [api]);

  // Runs at mount and again whenever the acknowledged time zone changes.
  useEffect(() => {
    void refresh();
  }, [refresh, timeZone]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), intervalMs);
    const onFocus = () => void refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh, intervalMs]);

  const value = useMemo(() => (today === null ? null : { today, refresh }), [today, refresh]);
  if (!value) return <>{fallback}</>;
  return <TodayContext.Provider value={value}>{children}</TodayContext.Provider>;
}

export function useToday(): TodayContextValue {
  const value = useContext(TodayContext);
  if (!value) throw new Error('useToday must be used inside <TodayProvider>.');
  return value;
}
