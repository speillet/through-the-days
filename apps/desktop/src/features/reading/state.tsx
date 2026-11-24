import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import type { SearchRequest } from '../../api/types';
import { toCommandError, useApi } from '../../api/client';
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
  const [date, setDate] = useState<string | null>(null);
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

/** Discards old results immediately on query/source changes; late requests cannot restore stale text. */
export function useReadingQuery<T>(read: () => Promise<T>) {
  const [result, setResult] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((v) => v + 1), []);
  useEffect(() => {
    let current = true;
    setResult({ data: null, error: null });
    void read().then(
      (data) => {
        if (current) setResult({ data, error: null });
      },
      (error) => {
        if (current) setResult({ data: null, error: toCommandError(error).message });
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
  return { ...result, reload, loading: result.data === null && result.error === null };
}
