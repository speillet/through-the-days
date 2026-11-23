// Neutral English status of a slot. An empty slot is simply "Not started":
// never a warning, a missing-entry count or a fabricated score.

import type { Entry } from '../../api/types';

export type EntryStatus = 'notStarted' | 'draft' | 'complete';

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  notStarted: 'Not started',
  draft: 'Draft',
  complete: 'Complete',
};

export function entryStatus(entry: Entry | null | undefined): EntryStatus {
  if (!entry) return 'notStarted';
  return entry.complete ? 'complete' : 'draft';
}
