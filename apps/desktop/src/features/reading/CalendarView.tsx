import { useCallback } from 'react';
import { useApi } from '../../api/client';
import { Button } from '../../components/Button';
import { CalendarGrid } from '../../components/CalendarGrid';
import { Notice } from '../../components/Notice';
import { formatLongDate } from '../../domain/dates';
import { useToday } from '../../state/clock';
import { usePreferences } from '../../state/preferences';
import { EntryPreview, Filters, numericFamily, SLOT_NAMES } from './shared';
import { useReading, useReadingQuery } from './state';

export function CalendarView({ journal = false }: { journal?: boolean }) {
  const api = useApi();
  const { today } = useToday();
  const { date, setDate, filters } = useReading();
  const selected = date ?? today;
  const { visibility } = usePreferences();
  const key = JSON.stringify(filters);
  const read = useCallback(() => api.searchEntries(JSON.parse(key)), [api, key]);
  const { data, error, loading, reload } = useReadingQuery(read);
  const entries = data ?? [];
  const selectedEntries = entries.filter((entry) => entry.date === selected);
  return (
    <div className="view reading-view">
      <header className="reading-heading">
        <div>
          <h1>{journal ? 'My Journal' : 'Calendar'}</h1>
          <p>Return to a day, in your own words.</p>
        </div>
        <Button onClick={() => setDate(today)}>Today</Button>
      </header>
      <Filters />
      {error ? (
        <Notice tone="error" actions={<Button onClick={reload}>Try again</Button>}>
          {error}
        </Notice>
      ) : null}
      {loading ? (
        <p role="status">Opening saved entries…</p>
      ) : journal ? (
        <>
          <p className="reading-meta">
            {entries.length} saved {entries.length === 1 ? 'entry' : 'entries'}. Search matches words in
            titles and writing, ignoring letter case and Latin accents.
          </p>
          {entries.length ? (
            entries.map((entry) => (
              <EntryPreview key={`${entry.id}:${entry.revision}`} entry={entry} origin="journal" />
            ))
          ) : (
            <p>No entries match these filters.</p>
          )}
        </>
      ) : (
        <div className="calendar-reading">
          <section className="calendar-reading__month" aria-label="Journal month">
            <CalendarGrid
              value={selected}
              today={today}
              onSelect={setDate}
              className="calendar--journal"
              dayMarkerLabel={(day) =>
                entries
                  .filter((entry) => entry.date === day)
                  .map((entry) => (entry.slot === 'morning' ? 'M' : 'E'))
                  .join(' ')
              }
              dayDescription={(day) =>
                entries
                  .filter((e) => e.date === day)
                  .map((e) => `, ${SLOT_NAMES[e.slot]} entry`)
                  .join('')
              }
              renderDay={(day) => (
                <span className="calendar-slots" aria-hidden="true">
                  {' '}
                  {entries
                    .filter((e) => e.date === day)
                    .map((e) => (
                      <span
                        key={e.id}
                        className="slot-marker"
                        data-family={visibility.scores ? numericFamily(e) : 'neutral'}
                      >
                        {e.slot === 'morning' ? 'M' : 'E'}{' '}
                      </span>
                    ))}
                </span>
              )}
            />
            <p className="reading-meta">
              M: Morning. E: Evening. Empty dates stay empty. A neutral value has no strong colour.
            </p>
          </section>
          <section className="calendar-reading__preview" aria-label="Selected date">
            <h2>{formatLongDate(selected)}</h2>
            {selectedEntries.length ? (
              selectedEntries.map((entry) => (
                <EntryPreview key={`${entry.id}:${entry.revision}`} entry={entry} />
              ))
            ) : (
              <p>No saved entry on this date.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
