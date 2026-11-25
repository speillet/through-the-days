import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useApi, toCommandError } from '../../api/client';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { formatLongDate, stepDays } from '../../domain/dates';
import { useToday } from '../../state/clock';
import { usePreferences } from '../../state/preferences';
import { EntryPreview } from './shared';
import { Coverage } from './Timeline';
import { useReading, useReadingQuery } from './state';

export function WeeklyView() {
  const api = useApi();
  const { today } = useToday();
  const { date, setDate, notes } = useReading();
  const selected = date ?? today;
  const { visibility, preferences } = usePreferences();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const {
    data,
    reload,
    error: readError,
  } = useReadingQuery(useCallback(() => api.weeklyReview(selected), [api, selected]));
  const entries = useReadingQuery(useCallback(() => api.listEntries(), [api]));
  useSyncExternalStore(notes.subscribe, notes.snapshot, notes.snapshot);
  useEffect(() => {
    if (data) notes.seed(data);
  }, [notes, data]);
  const draft = notes.get(data?.weekStart ?? selected);
  const pending = draft.saving || draft.value !== draft.saved;
  async function summary() {
    if (!data || busy) return;
    setBusy(true);
    setError(null);
    try {
      await notes.regenerateWeek(data.weekStart, (date, revision) => api.generateWeeklySummary(date, revision));
      reload();
    } catch (caught) {
      setError(toCommandError(caught).message);
    } finally {
      setBusy(false);
    }
  }
  const sources = (entries.data ?? []).filter(
    (entry) =>
      data && entry.date >= data.weekStart && entry.date <= data.weekEnd && entry.includeInInsights !== false,
  );
  // Null at 1 January 0001 and 31 December 9999: the week buttons stop there.
  const previousWeek = stepDays(selected, -7);
  const nextWeek = stepDays(selected, 7);
  return (
    <div className="view reading-view">
      <header className="reading-heading">
        <div>
          <h1>Weekly Review</h1>
          <p>A few recorded moments, and your own reflection.</p>
        </div>
        <div className="reading-actions">
          <Button disabled={previousWeek === null} onClick={() => previousWeek && setDate(previousWeek)}>
            Previous week
          </Button>
          <Button onClick={() => setDate(today)}>This week</Button>
          <Button disabled={nextWeek === null} onClick={() => nextWeek && setDate(nextWeek)}>
            Next week
          </Button>
        </div>
      </header>
      {readError ? (
        <Notice tone="error" actions={<Button onClick={reload}>Try again</Button>}>
          {readError}
        </Notice>
      ) : !data ? (
        <p role="status">Opening this week…</p>
      ) : (
        <>
          <h2>
            {formatLongDate(data.weekStart)} to {formatLongDate(data.weekEnd)}
          </h2>
          <p className="reading-meta">
            Monday–Sunday ISO week, using chosen journal dates. Entries excluded from insights are omitted.
          </p>
          <Coverage report={data.report} />
          {visibility.scores ? (
            <p>
              {data.report.wins} approved small {data.report.wins === 1 ? 'win' : 'wins'} and{' '}
              {data.report.actions} reported {data.report.actions === 1 ? 'action' : 'actions'}. CBT exercises
              are not available yet and are not counted.
            </p>
          ) : null}
          <section className="weekly-notes" aria-label="Your weekly reflection">
            <label className="reading-field">
              Your notes
              <textarea
                tabIndex={0}
                rows={7}
                value={draft.value}
                onChange={(event) => notes.change(data.weekStart, event.target.value)}
                placeholder="What would you like to remember about this week?"
              />
            </label>
            <div className="reading-row">
              <p role={draft.error ? 'alert' : 'status'}>{draft.error ?? (pending ? 'Saving…' : 'Saved')}</p>
              <Button onClick={() => void notes.flushWeek(data.weekStart)}>
                {draft.error ? 'Retry saving notes' : 'Save notes'}
              </Button>
            </div>
          </section>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {preferences.gentle ? null : (
            <section className="weekly-summary" aria-label="Optional local summary">
              <h2>Local summary</h2>
              <p className="reading-meta">
                Optional, deterministic text from the counts above. No model or network is used. Your notes
                remain separate.
              </p>
              {data.stale ? (
                <Notice tone="warning">
                  Sources changed. The old summary is hidden; recalculate to use current records.
                </Notice>
              ) : null}
              {data.summary ? <p>{data.summary}</p> : null}
              <Button onClick={() => void summary()} busy={busy}>
                Recalculate local summary
              </Button>
            </section>
          )}
          <section aria-label="Week sources">
            <h2>Recorded moments</h2>
            {entries.error ? (
              <Notice tone="error" actions={<Button onClick={entries.reload}>Retry loading sources</Button>}>
                {entries.error}
              </Notice>
            ) : entries.loading ? (
              <p role="status">Opening week sources…</p>
            ) : sources.length ? (
              sources.map((entry) => (
                <EntryPreview
                  key={entry.id}
                  entry={entry}
                  origin="weekly"
                  bookRequest={{ from: data.weekStart, to: data.weekEnd }}
                />
              ))
            ) : (
              <p>No recorded entries in this week. Your notes are still yours to write.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
