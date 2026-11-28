import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useApi, toCommandError } from '../../api/client';
import { Button } from '../../components/Button';
import { TAB_STOP } from '../../components/keyboard';
import { Notice } from '../../components/Notice';
import { pluralise } from '../../domain/copy';
import { formatLongDate, isIsoDate, isoWeekStart, stepDays } from '../../domain/dates';
import { useToday } from '../../state/clock';
import { useLeaveGuard } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import { EntryPreview, insightSources } from './shared';
import { Coverage } from './Timeline';
import { useReading, useReadingQuery } from './state';
import { unsaved } from './notes';

/** The Monday of a date's ISO week; a date the interface cannot read is kept for the journal to refuse. */
function weekOf(date: string): string {
  return isIsoDate(date) ? isoWeekStart(date) : date;
}

/** Why the shown week could not be left: its notes may still be saved, or they need the person's choice. */
type Blocked = 'retry' | 'conflict';

export function WeeklyView() {
  const api = useApi();
  const { today } = useToday();
  const { date, setDate, notes } = useReading();
  // Without a chosen date the review follows today, except into a new week while the notes of
  // the week shown are focused or not yet saved: a reflection stays with the week it is about.
  const [followed, setFollowed] = useState(today);
  const [writing, setWriting] = useState(false);
  // A field removed while focused gets no blur event.
  const notesField = useCallback((field: HTMLTextAreaElement | null) => {
    if (!field) setWriting(false);
  }, []);
  const selected = date ?? followed;
  const week = weekOf(selected);
  const { visibility, preferences } = usePreferences();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Keyed on the week, so a new day in the same week keeps the review and its notes in place.
  const {
    data,
    reload,
    error: readError,
  } = useReadingQuery(useCallback(() => api.weeklyReview(week), [api, week]));
  const entries = useReadingQuery(useCallback(() => api.listEntries(), [api]));
  useSyncExternalStore(notes.subscribe, notes.snapshot, notes.snapshot);
  useEffect(() => {
    if (data) notes.seed(data);
  }, [notes, data]);
  const weekKey = data?.weekStart ?? week;
  const draft = notes.get(weekKey);
  const pending = draft.saving || unsaved(draft);
  const keepWeek = date === null && (writing || pending) && weekOf(today) !== week;
  useEffect(() => {
    if (!keepWeek && followed !== today) setFollowed(today);
  }, [keepWeek, followed, today]);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  useEffect(() => {
    if (!pending && !draft.conflict) setBlocked(null);
  }, [pending, draft.conflict]);
  /** Saves the shown week's notes; false, with the reason shown, when the week has to stay open. */
  const settle = useCallback(async (): Promise<boolean> => {
    await notes.flushWeek(weekKey);
    const current = notes.get(weekKey);
    const outcome: Blocked | null = current.conflict
      ? 'conflict'
      : current.saving || unsaved(current)
        ? 'retry'
        : null;
    setBlocked(outcome);
    return outcome === null;
  }, [notes, weekKey]);
  // Another view waits for the shown week's notes, as another week does below.
  useLeaveGuard(settle);
  /** Shows another week once this week's notes are saved; a week already shown needs no save first. */
  async function show(nextWeek: string | null) {
    if (nextWeek !== null && weekOf(nextWeek) === week) return;
    if (!(await settle())) return;
    setDate(nextWeek);
    if (nextWeek === null) setFollowed(today);
  }
  async function summary() {
    if (!data || busy) return;
    setBusy(true);
    setError(null);
    try {
      await notes.regenerateWeek(data.weekStart, (date) => api.generateWeeklySummary(date));
      reload();
    } catch (caught) {
      setError(toCommandError(caught).message);
    } finally {
      setBusy(false);
    }
  }
  // The report lists the week's own dates: compared as text, the end of the week of 27 December
  // 9999, written +10000-01-02 by the journal, would sort before every date of that week.
  const sources = insightSources(entries.data ?? [], data?.report ?? null);
  // Week navigation stops at the journal date limits.
  const previousWeek = stepDays(selected, -7);
  const nextWeek = stepDays(selected, 7);
  return (
    <div className="view reading-view">
      <header className="view-header reading-heading">
        <div>
          <h1 className="view-title">Weekly Review</h1>
          <p className="view-subtitle">A few recorded moments, and your own reflection.</p>
        </div>
        <div className="reading-actions">
          <Button disabled={previousWeek === null} onClick={() => previousWeek && void show(previousWeek)}>
            Previous week
          </Button>
          <Button
            onClick={() => {
              // With no chosen week the review follows today again, also into a new week after
              // midnight. An earlier week kept for notes still being saved is left once they are.
              if (weekOf(today) === week) {
                setDate(null);
                setFollowed(today);
              } else {
                void show(null);
              }
            }}
          >
            This week
          </Button>
          <Button disabled={nextWeek === null} onClick={() => nextWeek && void show(nextWeek)}>
            Next week
          </Button>
        </div>
      </header>
      {blocked === 'retry' ? (
        <Notice tone="warning">
          These notes have changes that are not saved yet, so this week stays open and nothing is lost. Once they
          are saved, you can move on.
        </Notice>
      ) : null}
      {blocked === 'conflict' ? (
        <Notice tone="warning">
          These notes were changed elsewhere, so this week stays open. Choose Keep my text or Load saved text, then
          move on.
        </Notice>
      ) : null}
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
              {pluralise(data.report.wins, 'approved small win')} and{' '}
              {pluralise(data.report.actions, 'reported action')}.
            </p>
          ) : null}
          {/* Shown with or without scores: no exercise count exists to hide. */}
          <p>CBT exercises are not available yet and are not counted.</p>
          <section className="weekly-notes" aria-label="Your weekly reflection">
            <label className="reading-field">
              Your notes
              <textarea
                ref={notesField}
                tabIndex={TAB_STOP}
                rows={7}
                value={draft.value}
                onFocus={() => setWriting(true)}
                onBlur={() => setWriting(false)}
                onChange={(event) => notes.change(data.weekStart, event.target.value)}
                placeholder="What would you like to remember about this week?"
              />
            </label>
            <div className="reading-row">
              <p role={draft.error ? 'alert' : 'status'}>
                {draft.error ?? (draft.conflict ? 'Not saved' : pending ? 'Saving…' : 'Saved')}
              </p>
              {draft.conflict ? null : (
                <Button onClick={() => void notes.flushWeek(data.weekStart)}>
                  {draft.error ? 'Retry saving notes' : 'Save notes'}
                </Button>
              )}
            </div>
            {draft.conflict ? (
              <Notice
                tone="error"
                actions={
                  <>
                    <Button size="small" onClick={() => void notes.keepText(data.weekStart)}>
                      Keep my text
                    </Button>
                    <Button size="small" onClick={() => void notes.loadSavedText(data.weekStart)}>
                      Load saved text
                    </Button>
                  </>
                }
              >
                <p>These notes were changed elsewhere, so your text has not been saved.</p>
                <p>
                  Keep my text replaces the saved notes with your text. Load saved text replaces your text
                  with the saved notes; copy anything you want to keep first.
                </p>
              </Notice>
            ) : null}
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
