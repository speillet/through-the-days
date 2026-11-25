import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import type { SearchRequest } from '../../api/types';
import { toCommandError, useApi } from '../../api/client';
import { isJournalDate } from '../../domain/dates';
import { registerFlusher } from '../../state/flush';
import { usePreferences } from '../../state/preferences';
import { WeeklyNotesStore } from './notes';

export type ReadingOrigin = 'calendar' | 'journal' | 'weekly' | 'path';

function useReadingState() {
  const api = useApi();
  const [notes] = useState(() => new WeeklyNotesStore((...args) => api.saveWeeklyNotes(...args)));
  useEffect(() => {
    const stop = registerFlusher(notes);
    return () => {
      stop();
      notes.dispose();
    };
  }, [notes]);
  const [date, storeDate] = useState<string | null>(null);
  // The date every reading view shares; null follows today. Anything else must be a journal
  // date: a typed five-digit year or a step past the last date is ignored, never rendered.
  const setDate = useCallback((next: string | null) => {
    if (next === null || isJournalDate(next)) storeDate(next);
  }, []);
  const [bookId, setBookId] = useState<string | null>(null);
  const [bookRequest, setBookRequest] = useState<SearchRequest | null>(null);
  const [returnView, setReturnView] = useState<ReadingOrigin>('calendar');
  const [filters, setFilters] = useState<SearchRequest>({ text: '' });
  const [range, setRange] = useState(30);
  const [pathCustomRange, setPathCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [layers, setLayers] = useState({ scores: true, wins: true, milestones: true });
  const bookPositions = useRef(new Map<string, number>());
  return {
    date,
    setDate,
    bookId,
    setBookId,
    bookRequest,
    setBookRequest,
    returnView,
    setReturnView,
    filters,
    setFilters,
    range,
    setRange,
    pathCustomRange,
    setPathCustomRange,
    layers,
    setLayers,
    bookPositions,
    notes,
  };
}
const ReadingContext = createContext<ReturnType<typeof useReadingState> | null>(null);
export function ReadingProvider({ children }: { children: ReactNode }) {
  return <ReadingContext.Provider value={useReadingState()}>{children}</ReadingContext.Provider>;
}
export function useReading() {
  const context = useContext(ReadingContext);
  if (!context) throw new Error('ReadingProvider is required.');
  return context;
}

/** Hidden numeric controls never silently filter a reading surface; retain the person's choices. */
export function useReadingSelection(request?: SearchRequest | null): SearchRequest {
  const { filters } = useReading();
  const { visibility } = usePreferences();
  const selected = request ?? filters;
  return visibility.scores ? selected : { ...selected, metric: null, minimum: null };
}

/**
 * Each result belongs to the memoized read that produced it, so a changed query (a new read)
 * shows no old result from its first render. A refresh (journal change, window activation or
 * reload()) keeps the current result on screen until the new one settles, so the view keeps its
 * focus and place; a failed refresh replaces it with the error. Late requests cannot restore
 * stale text.
 */
export function useReadingQuery<T>(read: () => Promise<T>) {
  const [result, setResult] = useState<{
    read: () => Promise<T>;
    data: T | null;
    error: string | null;
  } | null>(null);
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((v) => v + 1), []);
  useEffect(() => {
    let current = true;
    void read().then(
      (data) => {
        if (current) setResult({ read, data, error: null });
      },
      (error) => {
        if (current) setResult({ read, data: null, error: toCommandError(error).message });
      },
    );
    return () => {
      current = false;
    };
  }, [read, generation]);
  useEffect(() => {
    window.addEventListener('journal-changed', reload);
    window.addEventListener('focus', reload);
    return () => {
      window.removeEventListener('journal-changed', reload);
      window.removeEventListener('focus', reload);
    };
  }, [reload]);
  const settled = result?.read === read ? result : null;
  const data = settled?.data ?? null;
  const error = settled?.error ?? null;
  return { data, error, reload, loading: data === null && error === null };
}
