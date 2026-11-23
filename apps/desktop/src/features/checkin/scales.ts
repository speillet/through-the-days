// English wording for the four independent self-report scales. Each option is
// read with its number and meaning; 5 on the mood and energy axes is neutral.

export interface ScaleWording {
  legend: string;
  hint: string;
  min: 0 | 1;
  max: 10;
  /** Visible captions under the start, middle and end of the scale. */
  captions: { start: string; middle?: string; end: string };
  /** Words read after the number, or null for a plain number. */
  describe(value: number): string | null;
  clearLabel: string;
}

export const MOOD_SCALE: ScaleWording = {
  legend: 'Mood',
  hint: '0 is very unpleasant, 5 is neutral and 10 is very pleasant.',
  min: 0,
  max: 10,
  captions: { start: 'Very unpleasant', middle: 'Neutral', end: 'Very pleasant' },
  describe: (value) =>
    value === 0
      ? 'very unpleasant'
      : value < 5
        ? 'unpleasant'
        : value === 5
          ? 'neutral'
          : value < 10
            ? 'pleasant'
            : 'very pleasant',
  clearLabel: 'Clear mood',
};

export const ENERGY_SCALE: ScaleWording = {
  legend: 'How is my energy?',
  hint: '0 is very low, 5 is neutral and 10 is very high.',
  min: 0,
  max: 10,
  captions: { start: 'Very low', middle: 'Neutral', end: 'Very high' },
  describe: (value) =>
    value === 0 ? 'very low' : value < 5 ? 'low' : value === 5 ? 'neutral' : value < 10 ? 'high' : 'very high',
  clearLabel: 'Clear energy',
};

function endpoints(value: number): string | null {
  if (value === 1) return 'a little';
  if (value === 10) return 'a lot';
  return null;
}

export const PRIDE_SCALE: ScaleWording = {
  legend: 'How proud do I feel?',
  hint: 'Optional. 1 is a little and 10 is a lot.',
  min: 1,
  max: 10,
  captions: { start: 'A little', end: 'A lot' },
  describe: endpoints,
  clearLabel: 'Clear pride',
};

export const PROGRESS_SCALE: ScaleWording = {
  legend: 'How much do I feel I moved forward?',
  hint: 'Optional. 1 is a little and 10 is a lot. It is separate from mood, energy and pride.',
  min: 1,
  max: 10,
  captions: { start: 'A little', end: 'A lot' },
  describe: endpoints,
  clearLabel: 'Clear progress',
};
