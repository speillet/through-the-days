import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { addMonths, CalendarGrid } from './CalendarGrid';

describe('CalendarGrid', () => {
  it('shows a Monday-first month with English names, marking today and the chosen date', () => {
    render(<CalendarGrid value="2026-11-22" today="2026-11-23" onSelect={() => {}} />);
    const grid = screen.getByRole('grid', { name: 'November 2026' });
    const rows = within(grid).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('button').map((day) => day.getAttribute('aria-label'))).toEqual([
      'Monday 26 October 2026',
      'Tuesday 27 October 2026',
      'Wednesday 28 October 2026',
      'Thursday 29 October 2026',
      'Friday 30 October 2026',
      'Saturday 31 October 2026',
      'Sunday 1 November 2026',
    ]);
    const today = screen.getByRole('button', { name: 'Monday 23 November 2026, today' });
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(screen.getByRole('button', { name: 'Sunday 22 November 2026' }).closest('td')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByRole('button').filter((button) => button.tabIndex === 0).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Previous month',
      'Next month',
      'Sunday 22 November 2026',
    ]);
  });

  it('moves by day, week, week edge, month and year from the keyboard, and chooses with Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CalendarGrid value="2026-01-31" today="2026-01-31" onSelect={onSelect} autoFocus />);
    const focused = () => document.activeElement?.getAttribute('aria-label');
    expect(focused()).toBe('Saturday 31 January 2026, today');
    await user.keyboard('{ArrowRight}');
    expect(focused()).toBe('Sunday 1 February 2026');
    expect(screen.getByRole('grid', { name: 'February 2026' })).toBeInTheDocument();
    await user.keyboard('{ArrowUp}');
    expect(focused()).toBe('Sunday 25 January 2026');
    await user.keyboard('{Home}');
    expect(focused()).toBe('Monday 19 January 2026');
    await user.keyboard('{End}');
    expect(focused()).toBe('Sunday 25 January 2026');
    await user.keyboard('{ArrowDown}');
    expect(focused()).toBe('Sunday 1 February 2026');
    await user.keyboard('{PageDown}');
    expect(focused()).toBe('Sunday 1 March 2026');
    await user.keyboard('{Shift>}{PageUp}{/Shift}');
    expect(focused()).toBe('Saturday 1 March 2025');
    await user.keyboard('{ArrowLeft}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('2025-02-28');
  });

  it('changes month with the month buttons without moving keyboard focus', async () => {
    const user = userEvent.setup();
    render(<CalendarGrid value="2026-11-22" today="2026-11-22" onSelect={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('grid', { name: 'December 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveFocus();
  });

  it('keeps the same day when changing month, clamped to shorter months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });
});
