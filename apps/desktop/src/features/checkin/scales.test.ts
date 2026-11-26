import { describe, expect, it } from 'vitest';
import { ENERGY_SCALE, MOOD_SCALE } from './scales';

describe('score scale wording', () => {
  it('names each mood and energy zone in words, including the neutral middle', () => {
    expect([0, 1, 5, 7, 10].map((value) => MOOD_SCALE.describe(value))).toEqual([
      'very unpleasant',
      'unpleasant',
      'neutral',
      'pleasant',
      'very pleasant',
    ]);
    expect([0, 3, 5, 6, 10].map((value) => ENERGY_SCALE.describe(value))).toEqual([
      'very low',
      'low',
      'neutral',
      'high',
      'very high',
    ]);
  });
});
