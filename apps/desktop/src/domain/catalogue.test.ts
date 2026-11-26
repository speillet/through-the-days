import { describe, expect, it } from 'vitest';
import type { Preferences } from '../api/types';
import { ACTION_CATEGORIES, CUSTOM_ACTION_CATEGORY } from './actions';
import { DEPTH_OPTIONS, SAVE_STATE_LABELS, SLOT_LABELS, UNAVAILABLE_VIEWS } from './copy';
import { DEFAULT_PREFERENCES, visibilityFor } from './preferences';

describe('action categories', () => {
  it('lists the preset categories with English labels', () => {
    expect(ACTION_CATEGORIES.map((category) => [category.id, category.label])).toEqual([
      ['work', 'Work'],
      ['walking', 'Walking'],
      ['exercise', 'Exercise'],
      ['reading', 'Reading'],
      ['social', 'Social'],
      ['rest', 'Rest'],
      ['creative', 'Creative'],
      ['self-care', 'Self-care'],
      ['other', 'Other'],
    ]);
  });

  it('treats the empty category as a custom action', () => {
    expect(ACTION_CATEGORIES.map((category) => category.id)).not.toContain(CUSTOM_ACTION_CATEGORY);
  });
});

describe('shared copy', () => {
  it('names slots and depths in English, with hideable durations', () => {
    expect(SLOT_LABELS).toEqual({ morning: 'Morning', evening: 'Evening' });
    expect(DEPTH_OPTIONS.map((option) => [option.label, option.duration])).toEqual([
      ['Quick Check-in', 'About 30 seconds'],
      ['Daily Journal', 'About 5–10 minutes'],
      ['Deep Reflection', 'About 15–20 minutes'],
    ]);
  });

  it('says plainly that Deep Reflection worksheets are not available yet', () => {
    expect(DEPTH_OPTIONS.find((option) => option.id === 'deep')?.summary).toMatch(/not available yet/);
  });

  it('uses the contract save-state wording', () => {
    expect(SAVE_STATE_LABELS).toEqual({ saving: 'Saving…', saved: 'Saved', failed: "Couldn't save", retry: 'Try again' });
  });

  it('lists every later milestone view', () => {
    expect(UNAVAILABLE_VIEWS).toEqual([
      'Keywords & Tags',
      'Goals & Counters',
      'CBT Exercises',
      'ChatGPT',
    ]);
  });
});

describe('Gentle view visibility', () => {
  const preferences = (changes: Partial<Preferences>): Preferences => ({ ...DEFAULT_PREFERENCES, ...changes });

  it('shows optional tracking according to each choice when Gentle view is off', () => {
    expect(visibilityFor(preferences({}))).toEqual({
      scores: true,
      durations: true,
      completionPrompts: true,
      toolbar: true,
      wordCount: false,
    });
    expect(visibilityFor(preferences({ showScores: false, showDurations: false })).scores).toBe(false);
  });

  it('hides scores, durations and completion prompts without changing the stored choices', () => {
    const gentle = preferences({ gentle: true, showWordCount: true });
    expect(visibilityFor(gentle)).toEqual({
      scores: false,
      durations: false,
      completionPrompts: false,
      toolbar: true,
      wordCount: true,
    });
    expect(gentle.showScores).toBe(true);
    expect(visibilityFor({ ...gentle, gentle: false }).scores).toBe(true);
  });
});
