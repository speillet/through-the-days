// Display preferences shared by every surface, and the Gentle view rule that
// composes them. Hiding something never changes or deletes saved values.

import type { Preferences, Theme } from '../api/types';

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
});

export const THEME_OPTIONS: readonly { id: Theme; label: string; description: string }[] = [
  { id: 'system', label: 'System', description: 'Follow the macOS appearance.' },
  { id: 'light', label: 'Light', description: 'Always use the light appearance.' },
  { id: 'dark', label: 'Dark', description: 'Always use the dark appearance.' },
];

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
