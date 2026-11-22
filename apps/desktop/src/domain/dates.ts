// English (en-GB) civil-date helpers. A journal date is a plain YYYY-MM-DD string:
// arithmetic works on day numbers rather than local Date objects, and names come
// from fixed English tables, so neither the Mac's time zone nor its language can
// shift or translate a date.

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Monday-first, as every calendar in the app. */
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const WEEKDAY_SHORT_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface CivilDate {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseIsoDate(value: string): CivilDate | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** A real calendar date written exactly as YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseIsoDate(value) !== null;
}

export function toIsoDate({ year, month, day }: CivilDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Days since 1970-01-01 in the proleptic Gregorian calendar (H. Hinnant's algorithm).
function dayNumber({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const shiftedMonth = (month + 9) % 12;
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDayNumber(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

function requireDate(value: string): CivilDate {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new RangeError(`Not a journal date: ${value}`);
  return parsed;
}

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(date: string): number {
  const days = dayNumber(requireDate(date));
  return (((days + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday.
}

export function addDays(date: string, amount: number): string {
  return toIsoDate(civilFromDayNumber(dayNumber(requireDate(date)) + amount));
}

/** "Sunday 22 November 2026". An invalid value is returned unchanged. */
export function formatLongDate(date: string): string {
  const parsed = parseIsoDate(date);
  if (!parsed) return date;
  return `${WEEKDAY_NAMES[weekdayIndex(date)]} ${parsed.day} ${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}

/** "22 November 2026". An invalid value is returned unchanged. */
export function formatDate(date: string): string {
  const parsed = parseIsoDate(date);
  if (!parsed) return date;
  return `${parsed.day} ${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}

/** "November 2026". */
export function formatMonth(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function zonedParts(instant: Date, timeZone: string, withTime: boolean): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: 'numeric', hourCycle: 'h23' as const } : {}),
  });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts;
}

/**
 * An IANA time-zone name the journal accepts. Intl matches names case-insensitively
 * and accepts UTC offsets; journal-core's parser does neither, so both are refused.
 */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone === '' || /^[+-]/.test(timeZone)) return false;
  try {
    const resolved = new Intl.DateTimeFormat('en-GB', { timeZone }).resolvedOptions().timeZone;
    return resolved === timeZone || resolved.toLowerCase() !== timeZone.toLowerCase();
  } catch {
    return false;
  }
}

/** Every IANA time zone this system knows, sorted, always including UTC. */
export function supportedTimeZones(): string[] {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return Array.from(new Set([...zones, 'UTC'])).sort((a, b) => a.localeCompare(b, 'en-GB'));
}

/** The current civil date in a time zone, independent of the Mac's own zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = zonedParts(now, timeZone, false);
  return toIsoDate({ year: parts.year, month: parts.month, day: parts.day });
}

/** "22 November 2026 at 14:05" for a Unix time in seconds, shown in a time zone. */
export function formatDateTime(unixSeconds: number, timeZone: string): string {
  let parts: Record<string, number>;
  try {
    parts = zonedParts(new Date(unixSeconds * 1000), timeZone, true);
  } catch {
    parts = zonedParts(new Date(unixSeconds * 1000), 'UTC', true);
  }
  const time = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  return `${parts.day} ${MONTH_NAMES[parts.month - 1]} ${parts.year} at ${time}`;
}

export interface MonthGridDay {
  date: string;
  day: number;
  inMonth: boolean;
}

/** Monday-first weeks covering a month, padded with the neighbouring days. */
export function monthGrid(year: number, month: number): MonthGridDay[][] {
  const first = toIsoDate({ year, month, day: 1 });
  const start = addDays(first, -weekdayIndex(first));
  const last = toIsoDate({ year, month, day: daysInMonth(year, month) });
  const end = addDays(last, 6 - weekdayIndex(last));
  const weeks: MonthGridDay[][] = [];
  for (let cursor = start; cursor <= end; ) {
    const week: MonthGridDay[] = [];
    for (let index = 0; index < 7; index += 1) {
      const parsed = requireDate(cursor);
      week.push({ date: cursor, day: parsed.day, inMonth: parsed.month === month && parsed.year === year });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}
