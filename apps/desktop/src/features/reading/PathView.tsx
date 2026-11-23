import { useCallback, useState } from 'react';
import { useApi, toCommandError } from '../../api/client';
import type { Milestone } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Notice } from '../../components/Notice';
import { addDays, formatLongDate } from '../../domain/dates';
import { addMonths } from '../../components/CalendarGrid';
import { newId } from '../../domain/entry';
import { useToday } from '../../state/clock';
import { useNavigation } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import { EntryPreview, Filters } from './shared';
import { useReading, useReadingQuery } from './state';

const RANGES = [7, 30, 90, 365];
export function PathView() {
  const api = useApi();
  const { today } = useToday();
  const { navigate } = useNavigation();
  const { visibility } = usePreferences();
  const { date, setDate, filters, setFilters, range, setRange, layers, setLayers, setBookId, setReturnView } =
    useReading();
  const selected = date ?? today;
  const from =
    range === 0
      ? filters.from || addDays(selected, -29)
      : range === 365
        ? addDays(addMonths(selected, -12), 1)
        : addDays(selected, 1 - range);
  const to = range === 0 ? filters.to || selected : selected;
  const request = { ...filters, from, to };
  const key = JSON.stringify(request);
  const entries = useReadingQuery(useCallback(() => api.searchEntries(JSON.parse(key)), [api, key]));
  const report = useReadingQuery(useCallback(() => api.readingReport(JSON.parse(key)), [api, key]));
  const milestones = useReadingQuery(useCallback(() => api.listMilestones(), [api]));
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [deleting, setDeleting] = useState<Milestone | null>(null);
  const records = (entries.data ?? []).filter((entry) => entry.includeInInsights !== false);
  const moments = (milestones.data ?? []).filter(
    (milestone) => milestone.date >= from && milestone.date <= to,
  );
  const days = report.data?.days ?? [];
  function openBook(id: string) {
    setBookId(id);
    setReturnView('path');
    setFilters(request);
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
              onClick={() => setRange(days)}
            >
              {days === 365 ? '1 year' : `${days} days`}
            </Button>
          ))}
          <Button
            aria-pressed={range === 0}
            onClick={() => {
              setFilters({ ...filters, from, to });
              setRange(0);
            }}
          >
            Custom range
          </Button>
        </div>
        <div className="reading-actions">
          <Button
            aria-label="Zoom in"
            disabled={range === 7}
            onClick={() => setRange(RANGES[Math.max(0, RANGES.indexOf(range) - 1)])}
          >
            Zoom in
          </Button>
          <Button
            aria-label="Zoom out"
            disabled={range === 365}
            onClick={() => setRange(RANGES[Math.min(3, RANGES.indexOf(range) + 1)])}
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
                if (e.target.value) setFilters({ ...filters, from: e.target.value });
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
                if (e.target.value) setFilters({ ...filters, to: e.target.value });
              }}
            />
          </label>
        </div>
      ) : (
        <div className="reading-actions">
          <Button onClick={() => setDate(addDays(selected, -range))}>Earlier range</Button>
          <Button onClick={() => setDate(addDays(selected, range))}>Later range</Button>
          <Button onClick={() => setDate(today)}>End today</Button>
        </div>
      )}
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
            const sources = records.filter((entry) => entry.date === day.date);
            const wins = sources.flatMap((entry) =>
              entry.wins.filter((win) => win.includeInInsights).map((win) => ({ entry, win })),
            );
            const dated = layers.milestones ? moments.filter((moment) => moment.date === day.date) : [];
            const hasContent =
              (layers.scores && sources.length) || (layers.wins && wins.length) || dated.length;
            if (!hasContent) {
              const empty = (at: number) => {
                const date = days[at]?.date;
                return (
                  date &&
                  !(layers.scores && records.some((e) => e.date === date)) &&
                  !(
                    layers.wins &&
                    records.some((e) => e.date === date && e.wins.some((w) => w.includeInInsights))
                  ) &&
                  !(layers.milestones && moments.some((m) => m.date === date))
                );
              };
              if (index > 0 && empty(index - 1)) return null;
              let end = index;
              while (end + 1 < days.length && empty(end + 1)) end++;
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
                      <EntryPreview
                        key={`${entry.id}:${entry.revision}`}
                        entry={entry}
                        origin="path"
                        bookRequest={request}
                      />
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
  async function save() {
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
