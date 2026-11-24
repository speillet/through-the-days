import { useState } from 'react';
import { useApi, toCommandError } from '../../api/client';
import type { Entry, ReadingReport, ScoreMetric, SearchRequest } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { formatLongDate } from '../../domain/dates';
import { documentText } from '../../domain/entry';
import { EMOTIONS, emotionById } from '../../domain/emotions';
import { useNavigation } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import { useReading, type ReadingOrigin } from './state';

export const METRIC_LABELS: Record<ScoreMetric, string> = {
  mood: 'Mood',
  energy: 'Energy',
  pride: 'Pride',
  progress: 'Perceived progress',
};
export const METRICS: readonly ScoreMetric[] = ['mood', 'energy', 'pride', 'progress'];
export const SLOT_NAMES = { morning: 'Morning', evening: 'Evening' };
/** Only the report authority decides which owned sources are eligible for an insight selection. */
export function insightSources(entries: readonly Entry[], report: ReadingReport | null): Entry[] {
  const includedIds = new Set(report?.days.flatMap((day) => day.observations.map((entry) => entry.id)));
  return entries.filter((entry) => entry.includeInInsights !== false && includedIds.has(entry.id));
}
export const plainDate = (date: string) => formatLongDate(date).split(' ').slice(1).join(' ');
export function scoreLabel(metric: ScoreMetric, value: number) {
  return `${METRIC_LABELS[metric]} ${value}/10${(metric === 'mood' || metric === 'energy') && value === 5 ? ' (neutral)' : ''}`;
}
export function numericFamily(entry: Pick<Entry, 'mood' | 'energy'>): string {
  if (entry.mood == null || entry.energy == null || entry.mood === 5 || entry.energy === 5) return 'neutral';
  return `${entry.mood > 5 ? 'pleasant' : 'unpleasant'}-${entry.energy > 5 ? 'high' : 'low'}`;
}

export function EntryValues({ entry }: { entry: Entry }) {
  const { visibility } = usePreferences();
  return (
    <>
      {visibility.scores ? (
        <div className="entry-scores">
          {METRICS.map((metric) =>
            entry[metric] == null ? null : <span key={metric}>{scoreLabel(metric, entry[metric]!)}</span>,
          )}
        </div>
      ) : null}
      {entry.emotion || entry.anotherEmotion ? (
        <p>{entry.anotherEmotion || emotionById(entry.emotion)?.label}</p>
      ) : null}
    </>
  );
}

export function CheckInReading({ entry, insights = false }: { entry: Entry; insights?: boolean }) {
  const wins = insights ? entry.wins.filter((win) => win.includeInInsights) : entry.wins;
  const labels = {
    intention: "Today's intention",
    proudOf: "What I'm proud of",
    difficulty: 'Main difficulty',
    nextStep: 'Next small step',
    helped: 'What helped',
    learned: 'What I learned',
  };
  return (
    <details className="reading-checkin" open={!documentText(entry.document).trim() || undefined}>
      <summary>Read check-in answers</summary>
      {entry.actions.length ? (
        <p>Reported actions: {entry.actions.map((action) => action.text).join(', ')}</p>
      ) : null}
      <dl>
        {Object.entries(labels).map(([key, label]) => {
          const value = entry.reflection[key as keyof typeof labels];
          return value ? (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ) : null;
        })}
      </dl>
      {wins.length ? (
        <>
          <h4>Small wins you recognised</h4>
          <ul>
            {wins.map((win) => (
              <li key={win.id}>{win.text}</li>
            ))}
          </ul>
        </>
      ) : null}
    </details>
  );
}

export function Filters({ includeDates = true }: { includeDates?: boolean }) {
  const { filters, setFilters } = useReading();
  const { visibility } = usePreferences();
  return (
    <form className="reading-filters" role="search" onSubmit={(e) => e.preventDefault()}>
      <label className="reading-search">
        Search journal
        <input
          type="search"
          aria-label="Search journal"
          tabIndex={0}
          value={filters.text ?? ''}
          placeholder="Find a word in your writing"
          onChange={(e) => setFilters({ ...filters, text: e.target.value })}
        />
      </label>
      <label>
        Slot filter
        <select
          tabIndex={0}
          aria-label="Slot filter"
          value={filters.slot ?? ''}
          onChange={(e) => setFilters({ ...filters, slot: (e.target.value as Entry['slot']) || null })}
        >
          <option value="">Both slots</option>
          <option value="morning">Morning</option>
          <option value="evening">Evening</option>
        </select>
      </label>
      <label>
        Status filter
        <select
          tabIndex={0}
          value={filters.complete == null ? '' : String(filters.complete)}
          onChange={(e) =>
            setFilters({ ...filters, complete: e.target.value === '' ? null : e.target.value === 'true' })
          }
        >
          <option value="">Drafts and completed</option>
          <option value="false">Drafts</option>
          <option value="true">Completed</option>
        </select>
      </label>
      <details>
        <summary>More filters</summary>
        <div className="reading-filter-details">
          {includeDates ? (
            <>
              <label>
                From
                <input
                  type="date"
                  lang="en-GB"
                  tabIndex={0}
                  value={filters.from ?? ''}
                  onChange={(e) => setFilters({ ...filters, from: e.target.value || null })}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  lang="en-GB"
                  tabIndex={0}
                  value={filters.to ?? ''}
                  onChange={(e) => setFilters({ ...filters, to: e.target.value || null })}
                />
              </label>
            </>
          ) : null}
          <label>
            Emotion
            <select
              tabIndex={0}
              value={filters.emotion ?? ''}
              onChange={(e) => setFilters({ ...filters, emotion: e.target.value || null })}
            >
              <option value="">Any emotion</option>
              {EMOTIONS.map((emotion) => (
                <option key={emotion.id} value={emotion.id}>
                  {emotion.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Small wins
            <select
              tabIndex={0}
              value={filters.hasWin == null ? '' : String(filters.hasWin)}
              onChange={(e) =>
                setFilters({ ...filters, hasWin: e.target.value === '' ? null : e.target.value === 'true' })
              }
            >
              <option value="">Any entry</option>
              <option value="true">With a small win</option>
              <option value="false">Without a small win</option>
            </select>
          </label>
          <Button size="small" variant="quiet" onClick={() => setFilters({ text: '' })}>
            Clear filters
          </Button>
          {visibility.scores ? (
            <>
              <label>
                Measure
                <select
                  tabIndex={0}
                  value={filters.metric ?? ''}
                  onChange={(e) =>
                    setFilters({ ...filters, metric: (e.target.value as ScoreMetric) || null, minimum: null })
                  }
                >
                  <option value="">Any measure</option>
                  {METRICS.map((metric) => (
                    <option key={metric} value={metric}>
                      {METRIC_LABELS[metric]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Minimum score
                <input
                  tabIndex={0}
                  type="number"
                  min={filters.metric === 'pride' || filters.metric === 'progress' ? 1 : 0}
                  max={10}
                  step={1}
                  disabled={!filters.metric}
                  value={filters.minimum ?? ''}
                  onChange={(e) =>
                    setFilters({ ...filters, minimum: e.target.value === '' ? null : Number(e.target.value) })
                  }
                />
              </label>
            </>
          ) : null}
        </div>
      </details>
    </form>
  );
}

export function EntryPreview({
  entry,
  origin = 'calendar',
  bookRequest,
}: {
  entry: Entry;
  origin?: ReadingOrigin;
  bookRequest?: SearchRequest;
}) {
  const api = useApi();
  const { navigate } = useNavigation();
  const { setBookId, setReturnView, setBookRequest } = useReading();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slot = SLOT_NAMES[entry.slot];
  async function toggleInsights(includeInInsights: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.saveEntry({ ...entry, includeInInsights });
    } catch (caught) {
      setError(toCommandError(caught).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="entry-preview" aria-label={`${slot} entry from ${plainDate(entry.date)}`}>
      <div className="reading-row">
        <h3>{entry.title || `${slot} entry`}</h3>
        <span className="reading-meta">{entry.complete ? 'Completed' : 'Draft'}</span>
      </div>
      <p className="reading-meta">
        {formatLongDate(entry.date)} · {slot}
      </p>
      <EntryValues entry={entry} />
      <p className="entry-excerpt">
        {Array.from(documentText(entry.document)).slice(0, 240).join('') ||
          'A saved check-in, ready to revisit.'}
      </p>
      <CheckInReading entry={entry} insights={origin === 'weekly' || origin === 'path'} />
      <div className="reading-actions">
        <Button
          size="small"
          onClick={() => {
            setBookId(entry.id);
            setReturnView(origin);
            setBookRequest(bookRequest ?? null);
            navigate('book');
          }}
        >
          Read {slot} in Book View
        </Button>
        <Button
          size="small"
          variant="quiet"
          aria-label={`Edit ${slot} entry from ${plainDate(entry.date)}`}
          onClick={() => navigate('today', { date: entry.date, slot: entry.slot })}
        >
          Edit {slot} entry
        </Button>
      </div>
      <label className="reading-permission">
        <input
          type="checkbox"
          tabIndex={0}
          checked={entry.includeInInsights !== false}
          disabled={busy}
          onChange={(e) => void toggleInsights(e.target.checked)}
        />
        Include in insights and timelines
      </label>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </section>
  );
}
