import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useApi } from '../../api/client';
import type { SearchRequest } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { formatLongDate } from '../../domain/dates';
import { useToday } from '../../state/clock';
import { useNavigation } from '../../state/navigation';
import { JournalDocument } from './Document';
import { SLOT_NAMES, CheckInReading, EntryValues, insightSources } from './shared';
import { useReading, useReadingQuery, useReadingSelection } from './state';

const RETURN_LABELS = {
  calendar: 'Calendar',
  journal: 'My Journal',
  weekly: 'Weekly Review',
  path: 'The Path So Far',
};

export function BookView() {
  const api = useApi();
  const { today } = useToday();
  const { navigate } = useNavigation();
  const { date, bookRequest, setBookRequest, bookId, setBookId, returnView, bookPositions } = useReading();
  const selection = useReadingSelection(bookRequest);
  const key = JSON.stringify(selection);
  const insightSelection =
    (returnView === 'path' || returnView === 'weekly') && Boolean(bookRequest?.from && bookRequest?.to);
  const { data, error } = useReadingQuery(
    useCallback(async () => {
      const request: SearchRequest = JSON.parse(key);
      if (!insightSelection) return api.searchEntries(request);
      const [sources, report] = await Promise.all([
        api.searchEntries({ ...request, hasWin: null }),
        api.readingReport(request),
      ]);
      return insightSources(sources, report);
    }, [api, key, insightSelection]),
  );
  const entries = [...(data ?? [])].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.slot === b.slot ? 0 : a.slot === 'morning' ? -1 : 1),
  );
  let index = entries.findIndex((entry) => entry.id === bookId);
  const missing = bookId !== null && data !== null && index < 0;
  if (index < 0)
    index = Math.max(
      0,
      entries.findIndex((entry) => entry.date === (date ?? today)),
    );
  const entry = entries[index];
  const page = useRef<HTMLDivElement>(null);
  const wheelAt = useRef(0);
  const turn = useCallback(
    (step: number) => {
      const next = entries[index + step];
      if (next) setBookId(next.id);
    },
    [entries, index, setBookId],
  );
  useLayoutEffect(() => {
    if (page.current && entry) page.current.scrollTop = bookPositions.current.get(entry.id) ?? 0;
  }, [entry?.id, bookPositions]);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        (event.target instanceof Element &&
          event.target.closest('input,textarea,select,[contenteditable="true"]')) ||
        window.getSelection()?.toString()
      )
        return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        turn(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [turn]);
  useEffect(() => {
    const element = page.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (
        Math.abs(event.deltaX) < 60 ||
        Math.abs(event.deltaX) < Math.abs(event.deltaY) * 2 ||
        Date.now() - wheelAt.current < 500
      )
        return;
      const direction = event.deltaX > 0 ? 1 : -1;
      if (!entries[index + direction]) return;
      event.preventDefault();
      wheelAt.current = Date.now();
      turn(direction);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [entries, index, turn]);
  return (
    <div className="view reading-view book-view">
      <header className="reading-heading">
        <h1>Book View</h1>
        <Button onClick={() => navigate(returnView)}>Return to {RETURN_LABELS[returnView]}</Button>
      </header>
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !data ? (
        <p role="status">Opening your journal…</p>
      ) : missing ? (
        <Notice
          tone="warning"
          actions={<Button onClick={() => setBookId(null)}>Start reading this selection</Button>}
        >
          The selected entry is no longer available in this selection.
        </Notice>
      ) : !entry ? (
        <section aria-label="Empty reading selection">
          <p>
            No entries match this reading selection. Return to its source view to change it, or read the whole
            journal.
          </p>
          <Button
            onClick={() => {
              setBookRequest({});
              setBookId(null);
            }}
          >
            Read all entries
          </Button>
        </section>
      ) : (
        <>
          <div className="reading-row book-controls">
            <Button aria-label="Previous entry" disabled={index === 0} onClick={() => turn(-1)}>
              Previous entry
            </Button>
            <p className="reading-meta">
              Entry {index + 1} of {entries.length}
            </p>
            <Button aria-label="Next entry" disabled={index === entries.length - 1} onClick={() => turn(1)}>
              Next entry
            </Button>
          </div>
          <div
            ref={page}
            className="book-page"
            tabIndex={0}
            aria-label="Scrollable journal page"
            onScroll={(event) => bookPositions.current.set(entry.id, event.currentTarget.scrollTop)}
          >
            <article aria-label={`${SLOT_NAMES[entry.slot]} journal entry`}>
              <header className="book-page__heading">
                <p>{formatLongDate(entry.date)}</p>
                <h2>{entry.title || `${SLOT_NAMES[entry.slot]} journal`}</h2>
                <p className="reading-meta">
                  {SLOT_NAMES[entry.slot]} · {entry.complete ? 'Completed' : 'Draft'}
                </p>
                <EntryValues entry={entry} />
              </header>
              <JournalDocument document={entry.document} />
              <CheckInReading entry={entry} />
            </article>
          </div>
          <footer className="reading-row">
            <p className="reading-meta">
              One whole entry per page. Use ← and → between entries; scroll to read long writing.
            </p>
            <Button onClick={() => navigate('today', { date: entry.date, slot: entry.slot })}>
              Edit this entry
            </Button>
          </footer>
        </>
      )}
    </div>
  );
}
