import { useCallback, type ComponentProps } from 'react';
import { useApi } from '../../api/client';
import type { ReadingReport } from '../../api/types';
import { Button } from '../../components/Button';
import { TAB_STOP } from '../../components/keyboard';
import { Notice } from '../../components/Notice';
import { pluralise, SLOT_LABELS } from '../../domain/copy';
import { addDays, formatLongDate } from '../../domain/dates';
import { SCORE_METRICS, TIMELINE_RANGES } from '../../domain/preferences';
import { usePreferences } from '../../state/preferences';
import { METRIC_LABELS } from './shared';
import { useReadingQuery } from './state';

export function SeriesControls() {
  const { preferences, update, visibility } = usePreferences();
  const selected = preferences.timelineMetrics;
  if (!visibility.scores) return null;
  return (
    <fieldset className="series-controls">
      <legend>Visible measures</legend>
      {SCORE_METRICS.map((metric) => (
        <label key={metric}>
          <input
            type="checkbox"
            tabIndex={TAB_STOP}
            checked={selected.includes(metric)}
            onChange={(event) => {
              const checked = event.target.checked;
              void update((current) => {
                const metrics = current.timelineMetrics;
                return {
                  timelineMetrics: checked
                    ? [...new Set([...metrics, metric])]
                    : metrics.filter((m) => m !== metric),
                };
              });
            }}
          />
          {METRIC_LABELS[metric]}
        </label>
      ))}
    </fieldset>
  );
}

export function Coverage({ report }: { report: ReadingReport }) {
  const { visibility, preferences } = usePreferences();
  // Scores are hidden by Gentle view or by Show scores in Settings; the notice names the cause.
  if (!visibility.scores)
    return preferences.gentle ? (
      <p className="reading-meta">
        Gentle view keeps recorded dates visible and hides optional measures and counts.
      </p>
    ) : (
      <p className="reading-meta">
        Scores are hidden in Settings, under Writing. Recorded dates stay visible; optional measures and
        counts are not shown.
      </p>
    );
  return (
    <div className="reading-coverage">
      <p>
        {pluralise(report.recordedDays, 'recorded day')} of {report.calendarDays};{' '}
        {pluralise(report.entries, 'saved entry', 'saved entries')}. Saved drafts are included.
        Missing scores are not zero.
      </p>
      <dl className="reading-measures">
        {preferences.timelineMetrics.map((metric) => (
          <div key={metric}>
            <dt>{METRIC_LABELS[metric]}</dt>
            <dd>
              <span>
                {report[metric].mean == null
                  ? 'No observations'
                  : `Mean ${report[metric].mean.toLocaleString('en-GB', { maximumFractionDigits: 1 })}/10, n=${report[metric].observations}`}
              </span>{' '}
              <span className="reading-meta">
                {pluralise(report[metric].recordedDays, 'recorded day')} of {report.calendarDays}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="reading-meta">
        Mood and energy: 0–10. Pride and perceived progress: 1–10. Each mean uses its own recorded
        observations. Entries excluded from insights are omitted.
      </p>
    </div>
  );
}

export function DayTimeline({
  report,
  onSelect,
}: {
  report: ReadingReport;
  onSelect: (date: string) => void;
}) {
  const { preferences, visibility } = usePreferences();
  const metrics = visibility.scores ? preferences.timelineMetrics : [];
  return (
    <div className="day-timeline" role="list" aria-label="Recorded days and gaps">
      {report.days.map((day) => (
        <div key={day.date} role="listitem">
          <button
            type="button"
            tabIndex={TAB_STOP}
            className="timeline-day"
            data-gap={day.observations.length === 0 || undefined}
            onClick={() => onSelect(day.date)}
            title={formatLongDate(day.date)}
          >
            <time dateTime={day.date}>
              {Number(day.date.slice(-2))}{' '}
              {new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(
                new Date(`${day.date}T12:00:00Z`),
              )}
            </time>
            {day.observations.length ? (
              day.observations.map((o) => (
                <span key={o.id} className="timeline-observation">
                  <strong>{SLOT_LABELS[o.slot]}</strong>
                  {metrics.length ? (
                    metrics.map((metric) => (
                      <span key={metric} className="timeline-value" data-metric={metric}>
                        {METRIC_LABELS[metric]} {o[metric] == null ? '—' : `${o[metric]}/10`}
                      </span>
                    ))
                  ) : (
                    <span>Recorded</span>
                  )}
                </span>
              ))
            ) : (
              <span className="reading-meta">No entry</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

/** The 7, 14 and 30-day range buttons of Trends and the Today timeline; the choice is saved as a preference. */
export function RangeButtons({ range, size }: { range: number } & Pick<ComponentProps<typeof Button>, 'size'>) {
  const { update } = usePreferences();
  return (
    <div className="reading-actions">
      {TIMELINE_RANGES.map((days) => (
        <Button
          key={days}
          size={size}
          variant={days === range ? 'primary' : 'quiet'}
          aria-pressed={days === range}
          onClick={() => void update({ timelineDays: days })}
        >
          {days} days
        </Button>
      ))}
    </div>
  );
}

export function MiniTimeline({ date, onSelect }: { date: string; onSelect: (date: string) => void }) {
  const api = useApi();
  const { preferences } = usePreferences();
  const range = preferences.timelineDays;
  const from = addDays(date, 1 - range);
  const { data, error } = useReadingQuery(
    useCallback(() => api.readingReport({ from, to: date }), [api, from, date]),
  );
  return (
    <section className="mini-timeline" aria-label="Recent journal days">
      <div className="reading-row">
        <h2>Through these days</h2>
        <RangeButtons range={range} size="small" />
      </div>
      <SeriesControls />
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : data ? (
        <DayTimeline report={data} onSelect={onSelect} />
      ) : (
        <p role="status">Opening recent days…</p>
      )}
    </section>
  );
}
