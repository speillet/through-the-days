// The journal time zone decides which civil date a new entry starts on. It is
// independent of the interface language, and changing it never moves the date
// of an existing entry.

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { TAB_STOP } from '../../components/keyboard';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { formatLongDate, supportedTimeZones } from '../../domain/dates';
import { useToday } from '../../state/clock';
import { usePreferences } from '../../state/preferences';

/**
 * Current time-zone rules change offsets only on a quarter hour of UTC time (some,
 * such as St John's and Adelaide, at half past), so an offset read during one
 * quarter hour holds until the next.
 */
const OFFSET_PERIOD_MS = 15 * 60 * 1000;
const offsetCache = new Map<string, string>();
let offsetCachePeriod = -1;

/**
 * "GMT+1" for a zone at the current moment, kept until the next quarter hour.
 * Only the offsets are kept: a formatter for each of several hundred zones would
 * hold megabytes for the rest of the session.
 */
function currentOffset(zone: string): string {
  const now = Date.now();
  const period = Math.floor(now / OFFSET_PERIOD_MS);
  if (period !== offsetCachePeriod) {
    offsetCache.clear();
    offsetCachePeriod = period;
  }
  let offset = offsetCache.get(zone);
  if (offset === undefined) {
    try {
      offset =
        new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'shortOffset' })
          .formatToParts(now)
          .find((part) => part.type === 'timeZoneName')?.value ?? '';
    } catch {
      offset = '';
    }
    offsetCache.set(zone, offset);
  }
  return offset;
}

export function timeZoneLabel(zone: string): string {
  const name = zone.replaceAll('_', ' ');
  const offset = currentOffset(zone);
  return offset ? `${name} (${offset})` : name;
}

function normalise(text: string): string {
  return text.toLowerCase().replaceAll('_', ' ').trim();
}

function systemTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function TimeZoneSection() {
  const { preferences, update } = usePreferences();
  const { today } = useToday();
  const listId = useId();
  const current = preferences.timeZone;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(current);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const macZone = useMemo(systemTimeZone, []);
  const listRef = useRef<HTMLSelectElement>(null);

  const zones = useMemo(() => {
    const all = supportedTimeZones();
    return all.includes(current) ? all : [current, ...all];
  }, [current]);

  const matches = useMemo(() => {
    const needle = normalise(query);
    if (!needle) return zones;
    return zones.filter((zone) => normalise(timeZoneLabel(zone)).includes(needle));
  }, [zones, query]);

  // A list box does not scroll to its selected option by itself; centre it.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || list.selectedIndex < 0 || list.options.length === 0) return;
    const optionHeight = list.scrollHeight / list.options.length;
    list.scrollTop = Math.max(0, (list.selectedIndex + 0.5) * optionHeight - list.clientHeight / 2);
  }, [matches]);

  async function apply(zone: string) {
    setConfirmation(null);
    setSelected(zone);
    if (await update({ timeZone: zone })) {
      setConfirmation(`New entries now use ${zone.replaceAll('_', ' ')}. Existing entries keep their dates.`);
    }
  }

  return (
    <div className="settings-stack">
      <p className="settings-text">
        New entries start on today&rsquo;s date in this time zone. Changing it never moves the dates of entries you
        have already written, and it does not change the language of the app.
      </p>
      <p className="settings-current">
        Current time zone: <strong>{current.replaceAll('_', ' ')}</strong>. Today&rsquo;s date there is{' '}
        {formatLongDate(today)}.
      </p>

      <TextField
        label="Search time zones"
        type="search"
        hint="Type a city or region, for example London or Tokyo."
        value={query}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      <div className="field">
        <label htmlFor={listId} className="field__label">
          Time zone
        </label>
        <select
          id={listId}
          ref={listRef}
          tabIndex={TAB_STOP}
          className="field__control timezone-list"
          size={8}
          value={matches.includes(selected) ? selected : ''}
          onChange={(event) => setSelected(event.currentTarget.value)}
        >
          {matches.map((zone) => (
            <option key={zone} value={zone}>
              {timeZoneLabel(zone)}
            </option>
          ))}
        </select>
        {matches.length === 0 ? <p className="field__hint">No time zone matches &ldquo;{query}&rdquo;.</p> : null}
      </div>

      <div className="settings-actions">
        <Button
          variant="primary"
          disabled={selected === current || !matches.includes(selected)}
          onClick={() => void apply(selected)}
        >
          Use this time zone
        </Button>
        {macZone && macZone !== current ? (
          <Button variant="quiet" onClick={() => void apply(macZone)}>
            Use this Mac&rsquo;s time zone ({macZone.replaceAll('_', ' ')})
          </Button>
        ) : null}
      </div>

      {confirmation ? <Notice tone="success">{confirmation}</Notice> : null}
    </div>
  );
}
