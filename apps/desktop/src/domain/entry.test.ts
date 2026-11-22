import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../api/types';
import { canComplete, documentText, EMPTY_DOCUMENT, isBlank, newDraft, newId, promotePride } from './entry';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

function written(text: string): Entry['document'] {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

describe('entry helpers', () => {
  it('creates an unsaved draft for the chosen date, slot, time zone and depth', () => {
    const draft = newDraft('2026-11-21', 'evening', 'Asia/Tokyo', 'quick');
    expect(draft).toMatchObject({
      date: '2026-11-21',
      slot: 'evening',
      revision: 0,
      mood: null,
      energy: null,
      pride: null,
      progress: null,
      complete: false,
      emotion: '',
      depth: 'quick',
      createdTimeZone: 'Asia/Tokyo',
      actions: [],
      wins: [],
    });
    expect(draft.document).toEqual(EMPTY_DOCUMENT);
    expect(draft.document).not.toBe(EMPTY_DOCUMENT);
    expect(draft.id).toMatch(UUID);
    expect(Object.values(draft.reflection).every((answer) => answer === '')).toBe(true);
  });

  it('generates RFC 4122 version 4 ids even without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    expect(newId()).toMatch(UUID);
    expect(newDraft('2026-11-22', 'morning', 'Europe/Paris').id).toMatch(UUID);
  });

  it('extracts document text the way journal-core does', () => {
    const document = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'One ' }, { type: 'text', text: 'two', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph' },
      ],
    };
    expect(documentText(document)).toBe('Title\nOne \ntwo\n');
    expect(documentText(EMPTY_DOCUMENT)).toBe('');
  });

  it('treats only Unicode white space as blank', () => {
    expect(isBlank(' \n\t  ')).toBe(true);
    expect(isBlank('·')).toBe(false);
    expect(isBlank('﻿')).toBe(false);
  });

  it('requires writing, mood and energy before completion; pride and progress never matter', () => {
    const draft = newDraft('2026-11-22', 'morning', 'Europe/Paris');
    expect(canComplete({ ...draft, document: written('Synthetic words.'), mood: 0, energy: 10 })).toBe(true);
    expect(canComplete({ ...draft, document: written('Synthetic words.'), mood: 0, energy: null })).toBe(false);
    expect(canComplete({ ...draft, document: written('   '), mood: 4, energy: 4 })).toBe(false);
    expect(canComplete({ ...draft, mood: 4, energy: 4 })).toBe(false);
  });

  it('promotes the proud-of answer into one small win, once', () => {
    const draft = newDraft('2026-11-22', 'evening', 'Europe/Paris');
    const answered = { ...draft, reflection: { ...draft.reflection, proudOf: 'Synthetic: kept going.' } };
    const promoted = promotePride(answered);
    expect(promoted.wins).toEqual([
      { id: expect.stringMatching(UUID), text: 'Synthetic: kept going.', origin: 'pride', includeInInsights: true },
    ]);
    expect(promotePride(promoted)).toBe(promoted);
    expect(promotePride(draft)).toBe(draft);
    expect(answered.wins).toEqual([]);
  });
});
