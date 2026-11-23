// Helpers for the guard tests: list the repository files a guard inspects and
// split TypeScript sources into code, string, template, regular-expression and
// comment segments. The splitter is deliberately small; it only has to tell the
// guards which text a person could read in the interface.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/** apps/desktop */
export const APP_ROOT = resolve(import.meta.dirname, '../..');
export const SRC_ROOT = join(APP_ROOT, 'src');

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'target',
  'gen',
  '.git',
  'test-results',
  'playwright-report',
]);

/** Every file below a directory, skipping build output and dependencies. */
export function listFiles(directory: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(name)) found.push(...listFiles(path));
    } else {
      found.push(path);
    }
  }
  return found.sort();
}

export function isTestFile(path: string): boolean {
  return /\.test\.tsx?$/.test(path) || /\.spec\.ts$/.test(path);
}

/** Application code under src: no tests, test helpers or these guards. */
export function firstPartySources(): string[] {
  return listFiles(SRC_ROOT).filter((path) => {
    if (!/\.tsx?$/.test(path) || isTestFile(path)) return false;
    const inside = relative(SRC_ROOT, path).split(sep)[0];
    return inside !== 'test' && inside !== 'guards';
  });
}

/** Unit tests, their helpers and the end-to-end specs: where fixtures live. */
export function testSources(): string[] {
  const unit = listFiles(SRC_ROOT).filter(
    (path) => /\.tsx?$/.test(path) && (isTestFile(path) || relative(SRC_ROOT, path).startsWith(`test${sep}`)),
  );
  const e2e = listFiles(join(APP_ROOT, 'e2e')).filter((path) => /\.ts$/.test(path));
  return [...unit, ...e2e];
}

export function read(path: string): string {
  return readFileSync(path, 'utf8');
}

export function displayPath(path: string): string {
  return relative(APP_ROOT, path).split(sep).join('/');
}

export type SegmentKind = 'code' | 'string' | 'template' | 'regex' | 'comment';

export interface Segment {
  kind: SegmentKind;
  text: string;
  /** 1-based line where the segment starts. */
  line: number;
}

// A slash starts a regular expression after these characters or keywords. "<" is
// left out so a JSX closing tag such as </p> is never mistaken for one.
const REGEX_PREFIX = /(?:^|[(,=:[!&|?{};+\-*%~^]|=>|\b(?:return|typeof|case|do|else|in|of|void|yield|await))\s*$/;

/** Splits TypeScript or TSX source into segments. JSX text stays in code segments. */
export function segments(source: string): Segment[] {
  const result: Segment[] = [];
  let line = 1;
  let index = 0;
  let codeStart = 0;
  let codeLine = 1;

  const flushCode = (end: number) => {
    if (end > codeStart) result.push({ kind: 'code', text: source.slice(codeStart, end), line: codeLine });
  };
  const take = (kind: SegmentKind, end: number) => {
    flushCode(index);
    const text = source.slice(index, end);
    result.push({ kind, text, line });
    line += text.split('\n').length - 1;
    index = end;
    codeStart = end;
    codeLine = line;
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '\n') {
      line += 1;
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      take('comment', end === -1 ? source.length : end);
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      take('comment', end === -1 ? source.length : end + 2);
    } else if (char === "'" || char === '"') {
      let end = index + 1;
      while (end < source.length && source[end] !== char && source[end] !== '\n') end += source[end] === '\\' ? 2 : 1;
      take('string', Math.min(end + 1, source.length));
    } else if (char === '`') {
      let end = index + 1;
      while (end < source.length && source[end] !== '`') end += source[end] === '\\' ? 2 : 1;
      take('template', Math.min(end + 1, source.length));
    } else if (char === '/' && REGEX_PREFIX.test(source.slice(Math.max(0, index - 40), index))) {
      let end = index + 1;
      let inClass = false;
      while (end < source.length && source[end] !== '\n' && (inClass || source[end] !== '/')) {
        if (source[end] === '\\') end += 1;
        else if (source[end] === '[') inClass = true;
        else if (source[end] === ']') inClass = false;
        end += 1;
      }
      if (source[end] !== '/') {
        index += 1;
        continue;
      }
      end += 1;
      while (/[a-z]/i.test(source[end] ?? '')) end += 1;
      take('regex', end);
    } else {
      index += 1;
    }
  }
  flushCode(source.length);
  return result;
}

/** Everything a person could read or the app could run: code, strings and JSX text, without comments. */
export function withoutComments(source: string): Segment[] {
  return segments(source).filter((segment) => segment.kind !== 'comment');
}

/** A letter that is not plain ASCII English, for example é, ß or 静. */
export const NON_ENGLISH_LETTER = /(?![A-Za-z])\p{L}/u;

/**
 * French words that do not occur in English interface copy. Matched case-insensitively
 * as whole words, so "Mars" or "des" inside other words never count.
 */
export const FRENCH_WORDS = [
  'aujourd',
  'avec',
  'annuler',
  'bonjour',
  'corbeille',
  'dans',
  'demain',
  'des',
  'dimanche',
  'enregistrer',
  'est',
  'fermer',
  'hier',
  'humeur',
  'janvier',
  'jeudi',
  'juillet',
  'juin',
  'lundi',
  'mais',
  'mardi',
  'matin',
  'mercredi',
  'merci',
  'nous',
  'novembre',
  'octobre',
  'ouvrir',
  'pour',
  'restaurer',
  'samedi',
  'sauvegarde',
  'semaine',
  'septembre',
  'soir',
  'sont',
  'supprimer',
  'une',
  'vendredi',
  'votre',
  'vous',
] as const;

const FRENCH_PATTERN = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${FRENCH_WORDS.join('|')})(?![\\p{L}\\p{N}_])`, 'iu');

/** The first French word in a text, or null. */
export function frenchWordIn(text: string): string | null {
  return FRENCH_PATTERN.exec(text)?.[0] ?? null;
}
