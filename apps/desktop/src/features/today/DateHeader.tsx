// The open journal date in Charter, marked "Today" when it is today's date, with
// day navigation. A date chosen here stays when the clock passes midnight; Today
// moves on by itself only from today's date with no entry open (see TodayView).

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Ref } from 'react';
import { Button } from '../../components/Button';
import { addDays, formatLongDate } from '../../domain/dates';
import { DatePickerPopover } from './DatePickerPopover';

export interface DateHeaderProps {
  date: string;
  today: string;
  /** Hides the navigation in focus mode; the date itself stays. */
  compact: boolean;
  onNavigate(date: string): void;
  headingRef?: Ref<HTMLHeadingElement>;
}

export function DateHeader({ date, today, compact, onNavigate, headingRef }: DateHeaderProps) {
  const isToday = date === today;
  return (
    <header className="today-header">
      <h1 ref={headingRef} tabIndex={-1} className="date-heading today-header__date">
        {formatLongDate(date)}
        {isToday ? (
          <>
            {' '}
            <span className="today-marker">Today</span>
          </>
        ) : null}
      </h1>
      {compact ? null : (
        <div className="today-header__nav" role="group" aria-label="Change day">
          <Button
            variant="secondary"
            size="small"
            icon={<ChevronLeft size={15} />}
            onClick={() => onNavigate(addDays(date, -1))}
          >
            Previous day
          </Button>
          <Button variant="secondary" size="small" onClick={() => onNavigate(addDays(date, 1))}>
            Next day
            <ChevronRight aria-hidden="true" size={15} />
          </Button>
          {isToday ? null : (
            <Button variant="quiet" size="small" onClick={() => onNavigate(today)}>
              Go to today
            </Button>
          )}
          <DatePickerPopover value={date} today={today} onSelect={onNavigate} />
        </div>
      )}
    </header>
  );
}
