import { useCallback } from 'react';
import { useApi } from '../../api/client';
import { TAB_STOP } from '../../components/keyboard';
import { Notice } from '../../components/Notice';
import { addDays, formatLongDate, isJournalDate } from '../../domain/dates';
import { useToday } from '../../state/clock';
import { useNavigation } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import { Filters } from './shared';
import { Coverage, DayTimeline, RangeButtons, SeriesControls } from './Timeline';
import { useReading, useReadingQuery, useReadingSelection } from './state';

export function TrendsView() {
  const api = useApi();
  const { today } = useToday();
  const { navigate } = useNavigation();
  const { date, setDate } = useReading();
  const filters = useReadingSelection();
  const selected = date ?? today;
  const { preferences } = usePreferences();
  const days = preferences.timelineDays;
  const key = JSON.stringify({ ...filters, from: addDays(selected, 1 - days), to: selected });
  const { data, error } = useReadingQuery(useCallback(() => api.readingReport(JSON.parse(key)), [api, key]));
  return (
    <div className="view reading-view">
      <header className="view-header reading-heading">
        <div>
          <h1 className="view-title">Trends</h1>
          <p className="view-subtitle">Recorded experiences, with room for the gaps.</p>
        </div>
        <label className="reading-field">
          Ending on
          <input
            type="date"
            lang="en-GB"
            tabIndex={TAB_STOP}
            value={selected}
            onChange={(e) => {
              // An empty field, or a year outside 0001–9999 (date fields take six digits), keeps the date.
              if (isJournalDate(e.target.value)) setDate(e.target.value);
            }}
          />
        </label>
      </header>
      <Filters includeDates={false} />
      <RangeButtons range={days} />
      <SeriesControls />
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : data ? (
        <>
          <p className="reading-meta">
            {formatLongDate(data.from)} to {formatLongDate(data.to)}
          </p>
          <Coverage report={data} />
          <DayTimeline report={data} onSelect={(date) => navigate('today', { date })} />
          <p className="reading-meta">
            Useful actions can coexist with difficult feelings. Intentions are never counted as completed
            actions. These observations do not establish cause or a mental-health grade.
          </p>
        </>
      ) : (
        <p role="status">Opening recorded observations…</p>
      )}
    </div>
  );
}
