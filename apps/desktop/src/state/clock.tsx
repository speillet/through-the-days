// Today's journal date in the configured time zone. The journal is authoritative;
// the value refreshes at midnight in that time zone, every minute, when the window
// regains focus, when the page is shown again and after the time zone changes, so an
// app left open overnight moves on to the new date as it begins. A window can stay
// focused while the Mac sleeps: waking then sends no focus event, and a timer due
// during sleep can run late. Entries that are already open keep their own chosen date.

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
import { msUntilMidnight, todayIn } from '../domain/dates';
import { usePreferences } from './preferences';

const TODAY_REFRESH_MS = 60_000;

/** The wait for midnight is worked out again at least this often (see the effect below). */
const MIDNIGHT_PLAN_MS = 60 * 60_000;

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

function untilMidnight(timeZone: string): number {
  try {
    return msUntilMidnight(timeZone);
  } catch {
    return msUntilMidnight('UTC');
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

  // The date changes at midnight in the journal time zone, so it is read again then,
  // not up to a minute later. The wait is worked out again within the hour before
  // midnight, as a daylight-saving change earlier that day shortens or lengthens it.
  useEffect(() => {
    let timer: number | undefined;
    const plan = () => {
      const wait = untilMidnight(timeZone);
      const next = () => {
        if (wait <= MIDNIGHT_PLAN_MS) void refresh();
        plan();
      };
      timer = window.setTimeout(next, Math.min(wait, MIDNIGHT_PLAN_MS));
    };
    plan();
    return () => window.clearTimeout(timer);
  }, [refresh, timeZone]);

  const value = useMemo(() => (today === null ? null : { today, refresh }), [today, refresh]);
  if (!value) return <>{fallback}</>;
  return <TodayContext.Provider value={value}>{children}</TodayContext.Provider>;
}

export function useToday(): TodayContextValue {
  const value = useContext(TodayContext);
  if (!value) throw new Error('useToday must be used inside <TodayProvider>.');
  return value;
}
