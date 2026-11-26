import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  FIRST_JOURNAL_DATE,
  formatDate,
  formatDateTime,
  formatLongDate,
  formatMonth,
  isIsoDate,
  isJournalDate,
  isValidTimeZone,
  LAST_JOURNAL_DATE,
  monthGrid,
  msUntilMidnight,
  stepDays,
  supportedTimeZones,
  todayIn,
  weekdayIndex,
} from './dates';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('journal dates', () => {
  it('runs these tests behind UTC so date drift would show', () => {
    expect(new Date(Date.UTC(2026, 10, 22)).getTimezoneOffset()).toBeGreaterThan(0);
  });

  it('formats en-GB long dates without shifting the day', () => {
    expect(formatLongDate('2026-11-22')).toBe('Sunday 22 November 2026');
    expect(formatLongDate('2026-01-01')).toBe('Thursday 1 January 2026');
    expect(formatLongDate('2024-02-29')).toBe('Thursday 29 February 2024');
    expect(formatDate('2026-11-22')).toBe('22 November 2026');
    expect(formatMonth(2026, 11)).toBe('November 2026');
  });

  it('keeps English names on a French Mac', () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'fr-FR', languages: ['fr-FR', 'fr'] });
    expect(formatLongDate('2026-11-22')).toBe('Sunday 22 November 2026');
    expect(formatDateTime(1_795_363_200, 'Europe/Paris')).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4} at \d{2}:\d{2}$/);
  });

  it('returns an invalid value unchanged rather than inventing a date', () => {
    expect(formatLongDate('2026-02-30')).toBe('2026-02-30');
    expect(formatDate('not a date')).toBe('not a date');
  });

  it('validates real YYYY-MM-DD dates only', () => {
    expect(isIsoDate('2026-11-22')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2100-02-29')).toBe(false);
    expect(isIsoDate('2000-02-29')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-01')).toBe(false);
    expect(isIsoDate('22/11/2026')).toBe(false);
    expect(isIsoDate(20261122)).toBe(false);
  });

  it('adds days across months, years and daylight-saving changes', () => {
    expect(addDays('2026-11-22', 1)).toBe('2026-11-23');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29'); // Europe: clocks go forward on the 29th
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26'); // Europe: clocks go back on the 25th
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // United States: clocks go forward
    expect(addDays('2026-11-22', -365)).toBe('2025-11-22');
  });

  it('uses Monday as the first weekday', () => {
    expect(weekdayIndex('2026-11-23')).toBe(0); // Monday
    expect(weekdayIndex('2026-11-22')).toBe(6); // Sunday
  });

  it('builds Monday-first month grids padded with neighbouring days', () => {
    const november = monthGrid(2026, 11);
    expect(november[0][0]).toEqual({ date: '2026-10-26', day: 26, inMonth: false });
    expect(november[0][6]).toEqual({ date: '2026-11-01', day: 1, inMonth: true });
    expect(november.at(-1)?.at(-1)).toEqual({ date: '2026-12-06', day: 6, inMonth: false });
    expect(november.every((week) => week.length === 7)).toBe(true);
    expect(november.flat().filter((day) => day?.inMonth)).toHaveLength(30);
    const february = monthGrid(2027, 2); // starts on a Monday and ends on a Sunday
    expect(february).toHaveLength(4);
    expect(february[0][0]?.date).toBe('2027-02-01');
  });

  it('accepts journal dates from 1 January 0001 to 31 December 9999 only', () => {
    expect([FIRST_JOURNAL_DATE, LAST_JOURNAL_DATE]).toEqual(['0001-01-01', '9999-12-31']);
    expect(isJournalDate('0001-01-01')).toBe(true);
    expect(isJournalDate('9999-12-31')).toBe(true);
    expect(isJournalDate('0000-12-31')).toBe(false);
    // A date field takes up to six year digits: a stray fifth digit is not a journal date.
    expect(isJournalDate('20261-11-24')).toBe(false);
    expect(isJournalDate('10000-01-01')).toBe(false);
    expect(isJournalDate('2026-02-30')).toBe(false);
    expect(isJournalDate(null)).toBe(false);
  });

  it('steps by days without passing the first or last journal date', () => {
    expect(stepDays('2026-11-22', 7)).toBe('2026-11-29');
    expect(stepDays('9999-12-30', 1)).toBe('9999-12-31');
    expect(stepDays('9999-12-31', 1)).toBeNull();
    expect(stepDays('9999-12-31', 7)).toBeNull();
    expect(stepDays('9999-12-31', 30)).toBeNull();
    expect(stepDays('0001-01-02', -1)).toBe('0001-01-01');
    expect(stepDays('0001-01-01', -1)).toBeNull();
    expect(stepDays('0001-01-07', -7)).toBeNull();
    // A date before the first journal date (a range start in year 0) may still move forward.
    expect(stepDays('0000-12-31', 1)).toBe('0001-01-01');
    expect(stepDays('0000-12-31', -1)).toBeNull();
  });

  it('builds the first and last supported months without inventing dates beyond them', () => {
    const first = monthGrid(1, 1); // 1 January 0001 was a Monday
    expect(first[0][0]).toEqual({ date: '0001-01-01', day: 1, inMonth: true });
    expect(first.flat().filter((day) => day?.inMonth)).toHaveLength(31);
    expect(first.at(-1)?.at(-1)).toEqual({ date: '0001-02-04', day: 4, inMonth: false });

    const last = monthGrid(9999, 12);
    expect(last).toHaveLength(5);
    expect(last.flat().filter((day) => day?.inMonth)).toHaveLength(31);
    expect(last[0][0]).toEqual({ date: '9999-11-29', day: 29, inMonth: false });
    expect(last.at(-1)?.map((day) => day?.date ?? null)).toEqual([
      '9999-12-27',
      '9999-12-28',
      '9999-12-29',
      '9999-12-30',
      '9999-12-31',
      null,
      null,
    ]);
  });
});

describe('time zones', () => {
  it('computes today in the journal time zone, independent of the computer', () => {
    const lateEvening = new Date('2026-11-22T23:30:00Z');
    expect(todayIn('Europe/Paris', lateEvening)).toBe('2026-11-23');
    expect(todayIn('America/Los_Angeles', lateEvening)).toBe('2026-11-22');
    expect(todayIn('Pacific/Auckland', new Date('2026-11-22T11:30:00Z'))).toBe('2026-11-23');
  });

  it('handles the nights when daylight saving time changes', () => {
    // Europe/Paris springs forward at 01:00 UTC on 29 March 2026.
    expect(todayIn('Europe/Paris', new Date('2026-03-28T22:59:00Z'))).toBe('2026-03-28');
    expect(todayIn('Europe/Paris', new Date('2026-03-28T23:00:00Z'))).toBe('2026-03-29');
    expect(todayIn('Europe/Paris', new Date('2026-03-29T01:30:00Z'))).toBe('2026-03-29');
    // Europe/Paris falls back at 01:00 UTC on 25 October 2026: midnight is 22:00 UTC the day before.
    expect(todayIn('Europe/Paris', new Date('2026-10-24T21:59:00Z'))).toBe('2026-10-24');
    expect(todayIn('Europe/Paris', new Date('2026-10-24T22:00:00Z'))).toBe('2026-10-25');
    expect(todayIn('Europe/Paris', new Date('2026-10-25T22:59:00Z'))).toBe('2026-10-25');
    expect(todayIn('Europe/Paris', new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-26');
  });

  it('counts the wall-clock time left before midnight in the journal time zone', () => {
    const lateEvening = new Date('2026-11-22T22:59:50.250Z'); // 23:59:50.250 in Paris
    expect(msUntilMidnight('Europe/Paris', lateEvening)).toBe(9_750);
    expect(msUntilMidnight('America/Los_Angeles', lateEvening)).toBe(9 * 3_600_000 + 9_750);
    expect(msUntilMidnight('Asia/Kolkata', new Date('2026-11-22T18:29:59Z'))).toBe(1_000);
    expect(msUntilMidnight('Europe/Paris', new Date('2026-11-22T23:00:00Z'))).toBe(24 * 3_600_000);
  });

  it('formats a Unix time as an English date and 24-hour time in a time zone', () => {
    const instant = Date.UTC(2026, 10, 22, 13, 5) / 1000;
    expect(formatDateTime(instant, 'Europe/Paris')).toBe('22 November 2026 at 14:05');
    expect(formatDateTime(instant, 'Asia/Tokyo')).toBe('22 November 2026 at 22:05');
    expect(formatDateTime(Date.UTC(2026, 10, 22, 23, 0) / 1000, 'Europe/Paris')).toBe('23 November 2026 at 00:00');
    expect(formatDateTime(instant, 'Not/AZone')).toBe('22 November 2026 at 13:05');
  });

  it('shows a time that no date can describe as an unknown date instead of failing', () => {
    // 9,999,999,999,999 seconds is about 317,000 years from now, beyond any JavaScript date.
    expect(formatDateTime(9_999_999_999_999, 'Europe/Paris')).toBe('Unknown date');
    expect(formatDateTime(9_999_999_999_999, 'Not/AZone')).toBe('Unknown date');
    expect(formatDateTime(Number.NaN, 'Europe/Paris')).toBe('Unknown date');
    // The last second of year 9999, the latest time a registered backup can have, still shows.
    expect(formatDateTime(253_402_300_799, 'UTC')).toBe('31 December 9999 at 23:59');
  });

  it('accepts IANA names the journal can parse', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('europe/paris')).toBe(false);
    expect(isValidTimeZone('+02:00')).toBe(false);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('lists the supported time zones, including UTC', () => {
    const zones = supportedTimeZones();
    expect(zones).toContain('UTC');
    expect(zones).toContain('Europe/Paris');
    expect(zones.every(isValidTimeZone)).toBe(true);
  });
});
