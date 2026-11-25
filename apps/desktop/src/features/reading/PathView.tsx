import { useCallback, useRef, useState } from 'react';
import { useApi, toCommandError } from '../../api/client';
import type { Milestone } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Notice } from '../../components/Notice';
import { addDays, formatLongDate, isIsoDate, isJournalDate, stepDays } from '../../domain/dates';
import { newId } from '../../domain/entry';
import { useToday } from '../../state/clock';
import { useNavigation } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import { EntryPreview, Filters, insightSources } from './shared';
import { useReading, useReadingQuery, useReadingSelection } from './state';

const RANGES = [7, 30, 90, 365];

/** Items grouped by their journal date. */
function byDate<T extends { date: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.date);
    if (group) group.push(item);
    else groups.set(item.date, [item]);
  }
  return groups;
}

export function PathView() {
  const api = useApi();
  const { today } = useToday();
  const { navigate } = useNavigation();
  const { visibility } = usePreferences();
  const {
    date,
    setDate,
    filters,
    pathCustomRange,
    setPathCustomRange,
    range,
    setRange,
    layers,
    setLayers,
    setBookId,
    setReturnView,
    setBookRequest,
  } = useReading();
  const selected = date ?? today;
  // A preset, "1 year" (365 days) included, is that many days ending on the selected date and
  // pages by its own length, so no date appears on two pages, 29 February included.
  const from = range === 0 ? pathCustomRange?.from || addDays(selected, -29) : addDays(selected, 1 - range);
  const to = range === 0 ? pathCustomRange?.to || selected : selected;
  const span = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  const validRange = isIsoDate(from) && isIsoDate(to) && Number.isFinite(span) && span > 0;
  const sourceRequest = { ...filters, from, to };
  const request = useReadingSelection(sourceRequest);
  const key = JSON.stringify(request);
  // The report decides eligibility using insight-visible wins; original search includes all owned wins.
  const entries = useReadingQuery(
    useCallback(() => api.searchEntries({ ...JSON.parse(key), hasWin: null }), [api, key]),
  );
  const report = useReadingQuery(useCallback(() => api.readingReport(JSON.parse(key)), [api, key]));
  const milestones = useReadingQuery(useCallback(() => api.listMilestones(), [api]));
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [deleting, setDeleting] = useState<Milestone | null>(null);
  const records = insightSources(entries.data ?? [], report.data);
  const moments = (milestones.data ?? []).filter(
    (milestone) => milestone.date >= from && milestone.date <= to,
  );
  const days = report.data?.days ?? [];
  // Looked up by date: scanning every source again for each day of a long range froze the view.
  const recordsOn = byDate(records);
  const momentsOn = byDate(moments);
  /** Whether a date has something in the selected layers. */
  const shown = (date: string) => {
    const sources = recordsOn.get(date);
    return Boolean(
      (layers.scores && sources) ||
      (layers.wins && sources?.some((entry) => entry.wins.some((win) => win.includeInInsights))) ||
      (layers.milestones && momentsOn.has(date)),
    );
  };
  function chooseRange(next: number) {
    if (range === 0) setDate(to);
    setRange(next);
  }
  function zoom(direction: -1 | 1) {
    if (range === 0) {
      const options = direction < 0 ? [...RANGES].reverse() : RANGES;
      const next = options.find((days) => (direction < 0 ? days < span : days > span));
      chooseRange(next ?? (direction < 0 ? 7 : 365));
    } else {
      chooseRange(RANGES[Math.max(0, Math.min(RANGES.length - 1, RANGES.indexOf(range) + direction))]);
    }
  }
  /** Moves the range one length earlier or later; null when it would pass 1 January 0001 or 31 December 9999. */
  function panning(direction: -1 | 1): (() => void) | null {
    if (!validRange) return null;
    if (range === 0) {
      const nextFrom = stepDays(from, direction * span);
      const nextTo = stepDays(to, direction * span);
      return nextFrom && nextTo ? () => setPathCustomRange({ from: nextFrom, to: nextTo }) : null;
    }
    const end = stepDays(selected, direction * range);
    return end ? () => setDate(end) : null;
  }
  const panEarlier = panning(-1);
  const panLater = panning(1);
  // A custom range moved to end today keeps its length, unless it would then start before 1 January 0001.
  const todayFrom = validRange ? stepDays(today, 1 - span) : null;
  function endToday() {
    // A preset range with no chosen date follows today, also after midnight.
    if (range !== 0) setDate(null);
    else if (todayFrom) setPathCustomRange({ from: todayFrom, to: today });
  }
  function openBook(id: string) {
    setBookId(id);
    setReturnView('path');
    setBookRequest(sourceRequest);
    navigate('book');
  }
  return (
    <div className="view reading-view path-view">
      <header className="reading-heading">
        <div>
          <h1>The Path So Far</h1>
          <p>Recorded days and moments you chose to keep.</p>
        </div>
        <Button
          onClick={() => setEditing({ id: newId(), date: selected, title: '', notes: '', revision: 0 })}
        >
          Add milestone
        </Button>
      </header>
      <Filters includeDates={false} />
      <div className="reading-row">
        <div className="reading-actions">
          {RANGES.map((days) => (
            <Button
              key={days}
              aria-pressed={range === days}
              variant={range === days ? 'primary' : 'quiet'}
              onClick={() => chooseRange(days)}
            >
              {days === 365 ? '1 year' : `${days} days`}
            </Button>
          ))}
          <Button
            aria-pressed={range === 0}
            onClick={() => {
              setPathCustomRange({ from, to });
              setRange(0);
            }}
          >
            Custom range
          </Button>
        </div>
        <div className="reading-actions">
          <Button
            aria-label="Zoom in"
            disabled={!validRange || (range === 0 ? span <= 7 : range === 7)}
            onClick={() => zoom(-1)}
          >
            Zoom in
          </Button>
          <Button
            aria-label="Zoom out"
            disabled={!validRange || (range === 0 ? span >= 365 : range === 365)}
            onClick={() => zoom(1)}
          >
            Zoom out
          </Button>
        </div>
      </div>
      {range === 0 ? (
        <div className="reading-actions">
          <label className="reading-field">
            From
            <input
              type="date"
              tabIndex={0}
              lang="en-GB"
              value={from}
              onChange={(e) => {
                // An empty field, or a year outside 0001–9999 (date fields take six digits), keeps the range.
                if (isJournalDate(e.target.value)) setPathCustomRange({ from: e.target.value, to });
              }}
            />
          </label>
          <label className="reading-field">
            To
            <input
              type="date"
              tabIndex={0}
              lang="en-GB"
              value={to}
              onChange={(e) => {
                if (isJournalDate(e.target.value)) setPathCustomRange({ from, to: e.target.value });
              }}
            />
          </label>
        </div>
      ) : null}
      <div className="reading-actions">
        <Button onClick={() => panEarlier?.()} disabled={!panEarlier}>
          Earlier range
        </Button>
        <Button onClick={() => panLater?.()} disabled={!panLater}>
          Later range
        </Button>
        <Button onClick={endToday} disabled={!validRange || (range === 0 && !todayFrom)}>
          End today
        </Button>
      </div>
      <fieldset className="series-controls">
        <legend>Timeline layers</legend>
        <label>
          <input
            type="checkbox"
            tabIndex={0}
            checked={layers.scores}
            onChange={(e) => setLayers({ ...layers, scores: e.target.checked })}
          />
          Journal and check-ins
        </label>
        <label>
          <input
            type="checkbox"
            tabIndex={0}
            checked={layers.wins}
            onChange={(e) => setLayers({ ...layers, wins: e.target.checked })}
          />
          Approved small wins
        </label>
        <label>
          <input
            type="checkbox"
            tabIndex={0}
            checked={layers.milestones}
            onChange={(e) => setLayers({ ...layers, milestones: e.target.checked })}
          />
          Private milestones
        </label>
      </fieldset>
      <p className="reading-meta">
        {formatLongDate(from)} to {formatLongDate(to)}. Experiments, tags, goals and imported conversations
        will appear only when those features are available.
      </p>
      {entries.error || report.error || milestones.error ? (
        <Notice tone="error">{entries.error || report.error || milestones.error}</Notice>
      ) : entries.loading || report.loading || milestones.loading ? (
        <p role="status">Opening recorded moments…</p>
      ) : (
        <div className="path-chronology">
          {days.map((day, index) => {
            const sources = recordsOn.get(day.date) ?? [];
            const wins = sources.flatMap((entry) =>
              entry.wins.filter((win) => win.includeInInsights).map((win) => ({ entry, win })),
            );
            const dated = layers.milestones ? (momentsOn.get(day.date) ?? []) : [];
            if (!shown(day.date)) {
              // One notice covers a run of empty days, from its first day.
              if (index > 0 && !shown(days[index - 1].date)) return null;
              let end = index;
              while (end + 1 < days.length && !shown(days[end + 1].date)) end++;
              return (
                <p className="path-gap" key={day.date}>
                  No records in the selected layers from {formatLongDate(day.date)}
                  {end === index ? '' : ` to ${formatLongDate(days[end].date)}`}.
                </p>
              );
            }
            return (
              <section className="path-day" key={day.date}>
                <div className="reading-row">
                  <h2>{formatLongDate(day.date)}</h2>
                  <Button size="small" variant="quiet" onClick={() => navigate('today', { date: day.date })}>
                    Open day
                  </Button>
                </div>
                {layers.scores
                  ? sources.map((entry) => (
                      <EntryPreview key={entry.id} entry={entry} origin="path" bookRequest={sourceRequest} />
                    ))
                  : null}
                {layers.wins && wins.length ? (
                  <section aria-label="Approved small wins">
                    <h3>Small wins</h3>
                    <ul>
                      {wins.map(({ entry, win }) => (
                        <li key={win.id}>
                          <p>{win.text}</p>
                          <Button size="small" variant="quiet" onClick={() => openBook(entry.id)}>
                            Read source entry
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {dated.map((milestone) => (
                  <section className="path-milestone" key={milestone.id} aria-label="Private milestone">
                    <h3>{milestone.title}</h3>
                    <p>{milestone.notes}</p>
                    <div className="reading-actions">
                      <Button size="small" onClick={() => setEditing(milestone)}>
                        Edit milestone
                      </Button>
                      <Button size="small" variant="quiet" onClick={() => setDeleting(milestone)}>
                        Delete milestone
                      </Button>
                    </div>
                  </section>
                ))}
              </section>
            );
          })}
        </div>
      )}
      {!visibility.scores ? (
        <p className="reading-meta">
          Gentle view hides numeric tracking while keeping your writing, wins and milestones accessible.
        </p>
      ) : null}
      {editing ? (
        <MilestoneDialog key={editing.id} milestone={editing} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this milestone?"
        confirmLabel="Delete milestone"
        tone="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) {
            await api.deleteMilestone(deleting.id, deleting.revision);
            setDeleting(null);
          }
        }}
      >
        This removes the selected milestone from your timeline.
      </ConfirmDialog>
    </div>
  );
}

function MilestoneDialog({ milestone, onClose }: { milestone: Milestone; onClose: () => void }) {
  const api = useApi();
  const [value, setValue] = useState(milestone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleField = useRef<HTMLInputElement>(null);
  async function save() {
    // The journal keeps no milestone without a title; ask for one instead of reporting its refusal.
    if (!value.title.trim()) {
      setError('Add a title before saving this milestone.');
      titleField.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveMilestone(value);
      onClose();
    } catch (caught) {
      setError(toCommandError(caught).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={milestone.revision ? 'Edit milestone' : 'Add milestone'}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>
            Save milestone
          </Button>
        </>
      }
    >
      <div className="milestone-form">
        <label className="reading-field">
          Date
          <input
            tabIndex={0}
            type="date"
            lang="en-GB"
            value={value.date}
            onChange={(e) => setValue({ ...value, date: e.target.value })}
          />
        </label>
        <label className="reading-field">
          Title
          <input
            ref={titleField}
            tabIndex={0}
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </label>
        <label className="reading-field">
          Notes
          <textarea
            tabIndex={0}
            rows={4}
            value={value.notes}
            onChange={(e) => setValue({ ...value, notes: e.target.value })}
          />
        </label>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Dialog>
  );
}
