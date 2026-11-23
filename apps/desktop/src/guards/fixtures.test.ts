// Guard: automated verification uses explicitly synthetic records only
// (product-guardrails: Synthetic verification data). No journal or backup file is
// kept in the app folder, fixtures carry no credentials or personal addresses, and
// deliberate non-English fixture text is labelled as a multilingual fixture.

import { describe, expect, it } from 'vitest';
import { APP_ROOT, displayPath, listFiles, NON_ENGLISH_LETTER, read, segments, testSources } from './sources';

const DATA_FILES = /\.(?:sqlite3?|db|age|duckdb)$|-(?:wal|shm)$|backup-plan\.json$|\.through-the-days-backups\.json$/;

const SECRETS: readonly [string, RegExp][] = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['API key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
];

/** Addresses on reserved example domains are synthetic by definition. */
const EMAIL =
  /[A-Za-z0-9._%+-]+@(?![A-Za-z0-9.-]*\b(?:example\.(?:com|org|net)|[A-Za-z0-9-]+\.(?:test|invalid|example))\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** Home folders in fixtures use an obviously fictional account name. */
const HOME_FOLDER = /\/Users\/(?!fictional\b|example\b|test\b|synthetic\b)[A-Za-z0-9._-]+/;

const TEST_CASE_START = /^\s*(?:it|test)(?:\.\w+)?\(/;

/**
 * A "multilingual" label counts when it is on one of the three lines before the text
 * or anywhere earlier in the same test case.
 */
function labelledMultilingual(lines: readonly string[], line: number): boolean {
  let start = Math.max(0, line - 4);
  for (let index = line - 1; index >= 0; index -= 1) {
    if (TEST_CASE_START.test(lines[index])) {
      start = Math.min(start, index);
      break;
    }
  }
  return /multilingual/i.test(lines.slice(start, line).join('\n'));
}

describe('synthetic verification data', () => {
  it('keeps no journal, backup or backup-plan file in the app folder', () => {
    const found = listFiles(APP_ROOT)
      .filter((path) => DATA_FILES.test(path))
      .map(displayPath);
    expect(found).toEqual([]);
  });

  it('uses fixtures without credentials, personal email addresses or real home folders', () => {
    const problems: string[] = [];
    for (const path of testSources()) {
      read(path)
        .split('\n')
        .forEach((line, index) => {
          const where = `${displayPath(path)}:${index + 1}`;
          for (const [label, pattern] of SECRETS)
            if (pattern.test(line)) problems.push(`${where} looks like a ${label}`);
          if (EMAIL.test(line)) problems.push(`${where} has an email address outside the reserved example domains`);
          if (HOME_FOLDER.test(line)) problems.push(`${where} names a home folder that is not fictional`);
        });
    }
    expect(problems).toEqual([]);
  });

  it('labels deliberate non-English fixture text as a multilingual fixture', () => {
    const problems: string[] = [];
    for (const path of testSources()) {
      const source = read(path);
      const lines = source.split('\n');
      for (const segment of segments(source)) {
        if (segment.kind !== 'string' && segment.kind !== 'template') continue;
        if (!NON_ENGLISH_LETTER.test(segment.text)) continue;
        if (!labelledMultilingual(lines, segment.line)) {
          problems.push(
            `${displayPath(path)}:${segment.line} has non-English text without a "multilingual fixture" label`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
