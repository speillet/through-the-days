// A Monday-first month grid for choosing a journal date, with English month and
// weekday names. One day is in the Tab order; arrow keys move by day and week,
// Home/End to the start or end of the week, Page Up/Down by month (with Shift, by
// year). Enter or Space chooses the focused day.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  addDays,
  daysInMonth,
  formatLongDate,
  formatMonth,
  monthGrid,
  parseIsoDate,
  toIsoDate,
  weekdayIndex,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT_NAMES,
} from '../domain/dates';
import { Button } from './Button';
import { classNames } from './classNames';
import { TAB_STOP } from './keyboard';
import './CalendarGrid.css';

export interface CalendarGridProps {
  /** The chosen journal date, YYYY-MM-DD. */
  value: string;
  /** Today's journal date, marked in the grid. */
  today: string;
  onSelect(date: string): void;
  /** Moves focus to the chosen day when the grid appears (for popovers). */
  autoFocus?: boolean;
  className?: string;
}

interface Month {
  year: number;
  month: number;
}

function monthOf(date: string): Month {
  const parsed = parseIsoDate(date);
  if (!parsed) throw new RangeError(`Not a journal date: ${date}`);
  return { year: parsed.year, month: parsed.month };
}

/** The same day in another month, clamped to that month's length (31 January + 1 month = 28/29 February). */
export function addMonths(date: string, amount: number): string {
  const parsed = parseIsoDate(date);
  if (!parsed) throw new RangeError(`Not a journal date: ${date}`);
  const index = parsed.year * 12 + (parsed.month - 1) + amount;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return toIsoDate({ year, month, day: Math.min(parsed.day, daysInMonth(year, month)) });
}

function inMonth(date: string, { year, month }: Month): boolean {
  const parsed = parseIsoDate(date);
  return parsed !== null && parsed.year === year && parsed.month === month;
}

export function CalendarGrid({ value, today, onSelect, autoFocus = false, className }: CalendarGridProps) {
  const labelId = useId();
  const [focused, setFocused] = useState(value);
  const [visible, setVisible] = useState<Month>(() => monthOf(value));
  const gridRef = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(autoFocus);

  // A new chosen date from outside shows its month.
  useEffect(() => {
    setFocused(value);
    setVisible(monthOf(value));
  }, [value]);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${focused}"]`)?.focus();
  }, [focused, visible]);

  function focusDate(date: string) {
    moveFocus.current = true;
    setFocused(date);
    setVisible(monthOf(date));
  }

  function showMonth(amount: number) {
    const next = addMonths(focused, amount);
    setFocused(next);
    setVisible(monthOf(next));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    let target: string | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        target = addDays(date, -1);
        break;
      case 'ArrowRight':
        target = addDays(date, 1);
        break;
      case 'ArrowUp':
        target = addDays(date, -7);
        break;
      case 'ArrowDown':
        target = addDays(date, 7);
        break;
      case 'Home':
        target = addDays(date, -weekdayIndex(date));
        break;
      case 'End':
        target = addDays(date, 6 - weekdayIndex(date));
        break;
      case 'PageUp':
        target = addMonths(date, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        target = addMonths(date, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    focusDate(target);
  }

  const weeks = monthGrid(visible.year, visible.month);
  const tabbable = inMonth(focused, visible) ? focused : toIsoDate({ ...visible, day: 1 });

  return (
    <div className={classNames('calendar', className)}>
      <div className="calendar__header">
        <Button
          variant="quiet"
          size="small"
          className="calendar__step"
          aria-label="Previous month"
          icon={<ChevronLeft size={16} />}
          onClick={() => showMonth(-1)}
        />
        <p id={labelId} className="calendar__month" aria-live="polite">
          {formatMonth(visible.year, visible.month)}
        </p>
        <Button
          variant="quiet"
          size="small"
          className="calendar__step"
          aria-label="Next month"
          icon={<ChevronRight size={16} />}
          onClick={() => showMonth(1)}
        />
      </div>
      <table ref={gridRef} role="grid" aria-labelledby={labelId} className="calendar__grid">
        <thead>
          <tr>
            {WEEKDAY_SHORT_NAMES.map((name, index) => (
              <th key={name} scope="col" className="calendar__weekday">
                <span aria-hidden="true">{name}</span>
                <span className="visually-hidden">{WEEKDAY_NAMES[index]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].date}>
              {week.map((day) => {
                const selected = day.date === value;
                const isToday = day.date === today;
                return (
                  <td key={day.date} role="gridcell" aria-selected={selected}>
                    <button
                      type="button"
                      data-date={day.date}
                      tabIndex={day.date === tabbable ? TAB_STOP : -1}
                      className={classNames(
                        'calendar__day',
                        !day.inMonth && 'calendar__day--outside',
                        selected && 'calendar__day--selected',
                        isToday && 'calendar__day--today',
                      )}
                      aria-label={`${formatLongDate(day.date)}${isToday ? ', today' : ''}`}
                      aria-current={isToday ? 'date' : undefined}
                      onClick={() => onSelect(day.date)}
                      onKeyDown={(event) => handleKeyDown(event, day.date)}
                      onFocus={() => setFocused(day.date)}
                    >
                      {day.day}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
