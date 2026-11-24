// Synthetic browser-preview counterparts of the native reading queries. Production uses Rust.
import type { Entry, ReadingReport, SearchRequest, ScoreMetric, WeeklyReview } from './types';
import { addDays, isIsoDate, weekdayIndex } from '../domain/dates';
import { documentText, isBlank } from '../domain/entry';

export const METRICS: readonly ScoreMetric[] = ['mood', 'energy', 'pride', 'progress'];
export interface PreviewReview {
  weekStart: string;
  notes: string;
  revision: number;
  summary: string | null;
  fingerprint: string | null;
}
// Native search indexes with SQLite FTS5's unicode61 tokenizer (remove_diacritics 2), approximated here.
// Words are runs of letters, numbers and private-use characters. Case folds, and only letters with an
// ASCII base lose their accents: an accented Latin e matches e, while a Greek letter keeps its accent.
const searchWords = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/([a-z])[\u0300-\u036f]+/g, '$1')
    .normalize('NFC')
    .match(/[\p{L}\p{N}\p{Co}]+/gu) ?? [];
// Each space-separated part of the query must appear as consecutive words, so "well-being" finds
// "well being" but not "being well". A part without a word, such as "?" or an emoji, is ignored,
// and a query without any word finds nothing.
const queryPhrases = (text: string) =>
  text
    .split(/\p{White_Space}+/u)
    .map(searchWords)
    .filter((phrase) => phrase.length > 0);
const containsEveryPhrase = (words: string[], phrases: string[][]) =>
  phrases.length > 0 &&
  phrases.every((phrase) =>
    words.some((_, start) => phrase.every((word, offset) => words[start + offset] === word)),
  );

export function filterPreviewEntries(entries: Entry[], request: SearchRequest): Entry[] {
  if (
    (request.from && !isIsoDate(request.from)) ||
    (request.to && !isIsoDate(request.to)) ||
    (request.from && request.to && request.from > request.to)
  )
    throw { code: 'date', message: 'Choose a valid date range.' };
  const text = request.text ?? '';
  const phrases = isBlank(text) ? null : queryPhrases(text);
  return entries.filter(
    (entry) =>
      (!request.from || entry.date >= request.from) &&
      (!request.to || entry.date <= request.to) &&
      (!request.slot || entry.slot === request.slot) &&
      (!request.emotion || entry.emotion === request.emotion) &&
      (request.complete == null || entry.complete === request.complete) &&
      (request.hasWin == null || entry.wins.length > 0 === request.hasWin) &&
      (!request.metric ||
        request.minimum == null ||
        (entry[request.metric] != null && entry[request.metric]! >= request.minimum)) &&
      (!phrases ||
        containsEveryPhrase(searchWords(`${entry.title}\n${documentText(entry.document)}`), phrases)),
  );
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
  for (let date = from; date <= to; date = addDays(date, 1)) {
    days.push({
      date,
      observations: selected
        .filter((entry) => entry.date === date)
        .sort((a, b) => (a.slot === b.slot ? 0 : a.slot === 'morning' ? -1 : 1))
        .map(({ id, slot, mood, energy, pride, progress }) => ({ id, slot, mood, energy, pride, progress })),
    });
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
