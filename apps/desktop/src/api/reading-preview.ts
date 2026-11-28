// Synthetic browser-preview counterparts of the native reading queries. Production uses Rust.
import type { Entry, ReadingReport, SearchRequest, ScoreMetric, WeeklyReview } from './types';
import { addDays, isIsoDate, weekdayIndex } from '../domain/dates';
import { documentText, isBlank } from '../domain/entry';

export interface PreviewReview {
  weekStart: string;
  notes: string;
  revision: number;
  summary: string | null;
  fingerprint: string | null;
}
// Native search indexes with SQLite FTS5's unicode61 tokenizer (remove_diacritics 2), approximated here.
// Words are runs of letters, numbers, private-use characters and Thai vowel and tone marks. Case folds,
// and only letters with an ASCII base lose their accents: an accented Latin e matches e, while a Greek
// letter keeps its accent. Chinese, Japanese, Korean and Thai do not separate words with spaces, so each
// Han, kana, Hangul or Thai character, with the Thai marks after it, is a word of its own. The character
// ranges and marks are those of is_unspaced and THAI_MARKS in crates/journal-core/src/reading.rs.
const UNSPACED_CHARACTER =
  /([\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u1100-\u11ff\u3005-\u3007\u3021-\u3029\u3038-\u303b\u3041-\u30ff\u3131-\u318e\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\uff66-\uffdc\u{1aff0}-\u{1b16f}\u{20000}-\u{3ffff}][\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]*)/gu;
const searchWords = (text: string): string[] =>
  text
    .toLowerCase()
    // Before normalising, as natively: decomposed Hangul or kana then stays split by character.
    .replace(UNSPACED_CHARACTER, ' $1 ')
    .normalize('NFD')
    .replace(/([a-z])[\u0300-\u036f]+/g, '$1')
    .normalize('NFC')
    .match(/[\p{L}\p{N}\p{Co}\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]+/gu) ?? [];
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

// The text search reads (D-017), as natively: the title, the writing, the six reflection answers,
// action and small-win text and the person's own emotion word, one per line. Insight reports read
// only the wins included in insights. This mirrors searchable_text in crates/journal-core/src/reading.rs.
const REFLECTION_FIELDS = ['intention', 'proudOf', 'difficulty', 'nextStep', 'helped', 'learned'] as const;
const searchableText = (entry: Entry, insights: boolean) =>
  [
    entry.title,
    documentText(entry.document),
    ...REFLECTION_FIELDS.map((field) => entry.reflection[field]),
    ...entry.actions.map((action) => action.text),
    ...entry.wins.filter((win) => !insights || win.includeInInsights).map((win) => win.text),
    entry.anotherEmotion,
  ].join('\n');

export function filterPreviewEntries(entries: Entry[], request: SearchRequest, insights = false): Entry[] {
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
      (!phrases || containsEveryPhrase(searchWords(searchableText(entry, insights)), phrases)),
  );
}

export function previewReport(entries: Entry[], request: SearchRequest): ReadingReport {
  const from = request.from;
  const to = request.to;
  if (!from || !to || !isIsoDate(from) || !isIsoDate(to) || from > to)
    throw { code: 'date', message: 'Choose a valid date range.' };
  // As natively, insight filters, the search text included, only use wins included in insights.
  const selected = filterPreviewEntries(entries, { ...request, hasWin: null }, true).filter(
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

/** 32-bit FNV-1a over UTF-16 code units. It tells synthetic data apart; it is not cryptography. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++)
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return hash;
}

export function previewFingerprint(entries: Entry[], from: string, to: string): string {
  const text = JSON.stringify(
    entries.filter((e) => e.date >= from && e.date <= to && e.includeInInsights !== false),
  );
  return fnv1a(text).toString(16);
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
