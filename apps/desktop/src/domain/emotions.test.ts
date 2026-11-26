import { describe, expect, it } from 'vitest';
import vocabulary from '../../../../crates/journal-core/assets/emotion-vocabulary.json';
import {
  EMOTION_FAMILIES,
  EMOTIONS,
  emotionById,
  emotionsInFamily,
  familyById,
  isEmotionId,
  quadrantFor,
} from './emotions';

describe('emotion vocabulary', () => {
  it('loads the versioned English vocabulary shared with journal-core', () => {
    expect(vocabulary.version).toBe(1);
    expect(EMOTION_FAMILIES.map((family) => family.id)).toEqual([
      'unpleasant-high',
      'pleasant-high',
      'unpleasant-low',
      'pleasant-low',
    ]);
    expect(EMOTIONS).toHaveLength(36);
    expect(EMOTION_FAMILIES.every((family) => emotionsInFamily(family.id).length === 9)).toBe(true);
    expect(new Set(EMOTIONS.map((emotion) => emotion.id)).size).toBe(EMOTIONS.length);
  });

  it('gives every emotion an English label and description', () => {
    expect(emotionById('anxious')).toEqual({
      id: 'anxious',
      label: 'Anxious',
      family: 'unpleasant-high',
      description: 'Uneasy about something that might happen.',
    });
    expect(emotionById('at-ease')?.label).toBe('At Ease');
    expect(EMOTIONS.every((emotion) => /^[A-Z]/.test(emotion.label) && emotion.description.endsWith('.'))).toBe(true);
    expect(isEmotionId('calm')).toBe(true);
    expect(isEmotionId('Calm')).toBe(false);
    expect(familyById('pleasant-low').label).toBe('Pleasant, lower energy');
  });
});

describe('quadrant rule', () => {
  it('maps 0–4 to unpleasant/low and 6–10 to pleasant/high', () => {
    expect(quadrantFor(2, 8)).toBe('unpleasant-high');
    expect(quadrantFor(9, 6)).toBe('pleasant-high');
    expect(quadrantFor(0, 0)).toBe('unpleasant-low');
    expect(quadrantFor(10, 4)).toBe('pleasant-low');
  });

  it('suggests no quadrant when a score is neutral or missing', () => {
    expect(quadrantFor(5, 8)).toBeNull();
    expect(quadrantFor(8, 5)).toBeNull();
    expect(quadrantFor(null, 8)).toBeNull();
    expect(quadrantFor(3, null)).toBeNull();
  });

  it('never changes a chosen label: Anxious with low energy keeps both', () => {
    const chosen = emotionById('anxious');
    expect(chosen?.family).toBe('unpleasant-high');
    expect(quadrantFor(3, 2)).toBe('unpleasant-low');
    expect(emotionById('anxious')).toEqual(chosen);
  });
});
