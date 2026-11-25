// Synthetic browser-preview counterparts of the native reading queries. Production uses Rust.
import type { Entry, ReadingReport, SearchRequest, ScoreMetric, WeeklyReview } from './types';
import { addDays, isIsoDate, weekdayIndex } from '../domain/dates';
import { documentText } from '../domain/entry';

export const METRICS: readonly ScoreMetric[] = ['mood', 'energy', 'pride', 'progress'];
export interface PreviewReview {
  weekStart: string;
  notes: string;
  revision: number;
  summary: string | null;
  fingerprint: string | null;
}
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function filterPreviewEntries(entries: Entry[], request: SearchRequest): Entry[] {
  if (
    (request.from && !isIsoDate(request.from)) ||
    (request.to && !isIsoDate(request.to)) ||
    (request.from && request.to && request.from > request.to)
  )
    throw { code: 'date', message: 'Choose a valid date range.' };
  const terms: string[] = fold(request.text ?? '').match(/[\p{L}\p{N}]+/gu) ?? [];
  return entries.filter((entry) => {
    const words: string[] =
      fold(`${entry.title}\n${documentText(entry.document)}`).match(/[\p{L}\p{N}]+/gu) ?? [];
    return (
      (!request.from || entry.date >= request.from) &&
      (!request.to || entry.date <= request.to) &&
      (!request.slot || entry.slot === request.slot) &&
      (!request.emotion || entry.emotion === request.emotion) &&
      (request.complete == null || entry.complete === request.complete) &&
      (request.hasWin == null || entry.wins.length > 0 === request.hasWin) &&
      (!request.metric ||
        request.minimum == null ||
        (entry[request.metric] != null && entry[request.metric]! >= request.minimum)) &&
      (!(request.text ?? '').trim() || (terms.length > 0 && terms.every((term) => words.includes(term))))
    );
  });
}

export function previewReport(entries: Entry[], request: SearchRequest): ReadingReport {
  const from = request.from;
  const to = request.to;
  if (!from || !to || !isIsoDate(from) || !isIsoDate(to) || from > to)
    throw { code: 'date', message: 'Choose a valid date range.' };
  const selected = filterPreviewEntries(entries, { ...request, hasWin: null }).filter(
    (entry) =>
      entry.includeInInsights !== false &&
      (request.hasWin == null || entry.wins.some((win) => win.includeInInsights) === request.hasWin),
  );
  const days: ReadingReport['days'] = [];
  // Stops on `to` itself: the day after 9999-12-31 has a five-digit year, which sorts before it as text.
  for (let date = from; ; date = addDays(date, 1)) {
    days.push({
      date,
      observations: selected
        .filter((entry) => entry.date === date)
        .sort((a, b) => (a.slot === b.slot ? 0 : a.slot === 'morning' ? -1 : 1))
        .map(({ id, slot, mood, energy, pride, progress }) => ({ id, slot, mood, energy, pride, progress })),
    });
    if (date === to) break;
  }
  const measure = (metric: ScoreMetric) => {
    const values = selected.flatMap((entry) => (entry[metric] == null ? [] : [entry[metric]!]));
    return {
      observations: values.length,
      recordedDays: new Set(selected.filter((entry) => entry[metric] != null).map((entry) => entry.date)).size,
      mean: values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null,
    };
  };
  return {
    from,
    to,
    calendarDays: days.length,
    recordedDays: days.filter((day) => day.observations.length).length,
    entries: selected.length,
    wins: new Set(selected.flatMap((e) => e.wins.filter((w) => w.includeInInsights).map((w) => w.id))).size,
    actions: selected.reduce((count, e) => count + e.actions.length, 0),
    mood: measure('mood'),
    energy: measure('energy'),
    pride: measure('pride'),
    progress: measure('progress'),
    days,
  };
}

export function isoWeekStart(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export function previewFingerprint(entries: Entry[], from: string, to: string): string {
  const text = JSON.stringify(
    entries.filter((e) => e.date >= from && e.date <= to && e.includeInInsights !== false),
  );
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++)
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return hash.toString(16);
}

export function previewWeek(entries: Entry[], date: string, stored?: PreviewReview): WeeklyReview {
  const weekStart = isoWeekStart(date);
  const weekEnd = addDays(weekStart, 6);
  const stale =
    stored?.fingerprint != null && stored.fingerprint !== previewFingerprint(entries, weekStart, weekEnd);
  return {
    weekStart,
    weekEnd,
    notes: stored?.notes ?? '',
    revision: stored?.revision ?? 0,
    summary: stale ? null : (stored?.summary ?? null),
    stale,
    report: previewReport(entries, { from: weekStart, to: weekEnd }),
  };
}

export function localSummary(report: ReadingReport): string {
  return `${report.recordedDays} recorded ${report.recordedDays === 1 ? 'day' : 'days'} out of 7, with ${report.entries} saved ${report.entries === 1 ? 'entry' : 'entries'}, ${report.wins} approved small ${report.wins === 1 ? 'win' : 'wins'} and ${report.actions} reported ${report.actions === 1 ? 'action' : 'actions'}. Saved drafts are included. Missing scores are left out; this is a description of recorded information, not a judgement of the week.`;
}
