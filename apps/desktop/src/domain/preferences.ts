// Display preferences shared by every surface, and the Gentle view rule that
// composes them. Hiding something never changes or deletes saved values.

import type { Preferences, TextScale, Theme } from '../api/types';

/** journal-core's Preferences::default(). */
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  timeZone: 'Europe/Paris',
  theme: 'system',
  gentle: false,
  showDurations: true,
  showToolbar: true,
  showScores: true,
  sidebarOpen: true,
  reduceMotion: false,
  defaultDepth: 'daily',
  showWordCount: false,
  textScale: 100,
});

export const THEME_OPTIONS: readonly { id: Theme; label: string; description: string }[] = [
  { id: 'system', label: 'System', description: 'Follow the macOS appearance.' },
  { id: 'light', label: 'Light', description: 'Always use the light appearance.' },
  { id: 'dark', label: 'Dark', description: 'Always use the dark appearance.' },
];

/** Text sizes, smallest first; journal-core accepts exactly these values. */
export const TEXT_SCALES: readonly TextScale[] = [100, 115, 130, 150];

export const TEXT_SCALE_OPTIONS: readonly { id: TextScale; label: string; description: string }[] = [
  { id: 100, label: 'Default', description: '100%' },
  { id: 115, label: 'Large', description: '115%' },
  { id: 130, label: 'Larger', description: '130%' },
  { id: 150, label: 'Largest', description: '150%' },
];

export function isTextScale(value: unknown): value is TextScale {
  return TEXT_SCALES.includes(value as TextScale);
}

/**
 * The next text size for the View shortcuts: Command-plus (+1), Command-minus (-1) and
 * Command-0 (0, back to the default). Stays at the smallest or largest size at either end.
 */
export function steppedTextScale(current: TextScale, step: -1 | 0 | 1): TextScale {
  if (step === 0) return DEFAULT_PREFERENCES.textScale;
  const index = Math.max(0, TEXT_SCALES.indexOf(current));
  return TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, index + step))];
}

/** What a surface may show. Gentle view hides optional tracking, never data-protection messages. */
export interface Visibility {
  /** Optional numeric panels: mood, energy, pride and progress values. */
  scores: boolean;
  /** Suggested durations beside writing depths. */
  durations: boolean;
  /** Prompts that invite completing an entry or answering more. */
  completionPrompts: boolean;
  toolbar: boolean;
  wordCount: boolean;
}

export function visibilityFor(preferences: Preferences): Visibility {
  return {
    scores: preferences.showScores && !preferences.gentle,
    durations: preferences.showDurations && !preferences.gentle,
    completionPrompts: !preferences.gentle,
    toolbar: preferences.showToolbar,
    wordCount: preferences.showWordCount,
  };
}
