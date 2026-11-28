// Pure entry helpers that mirror crates/journal-core/src/model.rs so the interface
// predicts exactly what the journal will accept.

import type { JSONContent } from '@tiptap/core';
import type { Depth, Entry, Slot } from '../api/types';

/** The empty Tiptap document journal-core uses for a new draft. */
export const EMPTY_DOCUMENT: Readonly<JSONContent> = Object.freeze({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

function randomUuidFallback(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A random UUID v4 for entries, actions and wins. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return randomUuidFallback();
}

/** A fresh, never-saved draft for the chosen journal date and slot (revision 0). */
export function newDraft(date: string, slot: Slot, timeZone: string, depth: Depth = 'daily'): Entry {
  return {
    id: newId(),
    date,
    slot,
    document: structuredCopy(EMPTY_DOCUMENT),
    revision: 0,
    mood: null,
    energy: null,
    complete: false,
    title: '',
    pride: null,
    progress: null,
    emotion: '',
    anotherEmotion: '',
    depth,
    reflection: { intention: '', proudOf: '', difficulty: '', nextStep: '', helped: '', learned: '' },
    actions: [],
    wins: [],
    createdTimeZone: timeZone,
    includeInInsights: true,
  };
}

function structuredCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Node types whose content is inline: their text runs and line breaks form the block's text. */
const TEXT_BLOCK_TYPES: ReadonlySet<string> = new Set(['paragraph', 'heading', 'codeBlock']);

/**
 * Plain text of a document, as journal-core's document_text extracts it: the text runs
 * of a paragraph, heading or code block joined as written, so formatting part of a word
 * never splits it, a hard break as a new line, and one line break between blocks.
 */
export function documentText(node: JSONContent | null | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (node.type === 'hardBreak') return '\n';
  if (!Array.isArray(node.content)) return '';
  return node.content.map(documentText).join(TEXT_BLOCK_TYPES.has(node.type ?? '') ? '' : '\n');
}

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter('en-GB', { granularity: 'grapheme' }).segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

/**
 * A short, faithful preview of the person's own words: whitespace is collapsed and a text longer
 * than `length` graphemes is shortened at a word boundary, but nothing is translated or rewritten.
 */
export function previewText(text: string, length: number): string {
  const source = text.replace(/\s+/gu, ' ').trim();
  const parts = graphemes(source);
  if (parts.length <= length) return source;
  const cut = parts.slice(0, length).join('');
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > cut.length * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Blank by Rust's definition: only Unicode White_Space characters. */
export function isBlank(text: string): boolean {
  return /^\p{White_Space}*$/u.test(text);
}

/** The completion predicate: some writing, plus a mood and an energy score. */
export function canComplete(entry: Pick<Entry, 'document' | 'mood' | 'energy'>): boolean {
  return entry.mood !== null && entry.energy !== null && !isBlank(documentText(entry.document));
}

export function hasPrideWin(entry: Pick<Entry, 'wins'>): boolean {
  return entry.wins.some((win) => win.origin === 'pride');
}

/**
 * "Add as a small win": promotes the proud-of answer into one linked win.
 * Idempotent; returns the same entry when there is nothing new to add.
 */
export function promotePride(entry: Entry): Entry {
  if (isBlank(entry.reflection.proudOf) || hasPrideWin(entry)) return entry;
  return {
    ...entry,
    wins: [...entry.wins, { id: newId(), text: entry.reflection.proudOf, origin: 'pride', includeInInsights: true }],
  };
}
