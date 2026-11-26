// Shared English labels used by more than one surface.

import type { Depth, Slot } from '../api/types';

export const APP_NAME = 'Through the Days';

export const SLOT_LABELS: Record<Slot, string> = { morning: 'Morning', evening: 'Evening' };

export interface DepthOption {
  id: Depth;
  label: string;
  /** Suggested duration; hidden when durations are off or in Gentle view. */
  duration: string;
  summary: string;
}

export const DEPTH_OPTIONS: readonly DepthOption[] = [
  {
    id: 'quick',
    label: 'Quick Check-in',
    duration: 'About 30 seconds',
    summary: 'How you feel right now and a sentence or two.',
  },
  {
    id: 'daily',
    label: 'Daily Journal',
    duration: 'About 5–10 minutes',
    summary: 'The optional check-in, then free writing.',
  },
  {
    id: 'deep',
    label: 'Deep Reflection',
    duration: 'About 15–20 minutes',
    summary: 'The full check-in and free writing for now. Guided worksheets are not available yet.',
  },
];

export const SAVE_STATE_LABELS = {
  saving: 'Saving…',
  saved: 'Saved',
  failed: "Couldn't save",
  retry: 'Try again',
} as const;

/** Later milestones, listed in navigation as unavailable rather than as placeholder screens. */
export const UNAVAILABLE_VIEWS = [
  'Keywords & Tags',
  'Goals & Counters',
  'CBT Exercises',
  'ChatGPT',
] as const;

export const NOT_AVAILABLE_YET = 'Not available yet';
