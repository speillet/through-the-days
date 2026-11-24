// One ordered stream per week for note saves and summary recalculation, retained across view
// changes. Only note saves advance the notes revision; a summary leaves it alone. A refused save
// is never resent on the same revision: the week is read again, and notes that changed
// elsewhere wait until the person keeps their text or loads the saved text.
import type { WeeklyReview } from '../../api/types';
import { toCommandError, type JournalApi } from '../../api/client';

/** Stored notes that differ from both the local text and the text it was last saved as. */
interface NotesConflict {
  notes: string;
  revision: number;
}
interface NotesDraft {
  value: string;
  /** The stored text this draft starts from, at revision. */
  saved: string;
  revision: number;
  saving: boolean;
  error: string | null;
  /** Nothing is sent while set: the person keeps their text or loads this one. */
  conflict: NotesConflict | null;
}
type NotesApi = Pick<JournalApi, 'saveWeeklyNotes' | 'weeklyReview'>;
type GenerateSummary = (date: string) => Promise<WeeklyReview>;
type Choice = (draft: NotesDraft, stored: NotesConflict) => void;
export class WeeklyNotesStore {
  private drafts = new Map<string, NotesDraft>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private flights = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private version = 0;
  constructor(private api: NotesApi) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.version;
  private notify() {
    this.version++;
    for (const listener of this.listeners) listener();
  }
  get(date: string): NotesDraft {
    return (
      this.drafts.get(date) ?? {
        value: '',
        saved: '',
        revision: 0,
        saving: false,
        error: null,
        conflict: null,
      }
    );
  }
  seed(review: WeeklyReview) {
    const current = this.drafts.get(review.weekStart);
    if (current && (current.saving || current.value !== current.saved || current.revision > review.revision))
      return;
    if (current?.revision === review.revision && current.saved === review.notes) return;
    this.drafts.set(review.weekStart, {
      value: review.notes,
      saved: review.notes,
      revision: review.revision,
      saving: false,
      error: null,
      conflict: null,
    });
    this.notify();
  }
  change(date: string, value: string) {
    const current = this.get(date);
    current.value = value;
    current.error = null;
    this.drafts.set(date, current);
    clearTimeout(this.timers.get(date));
    this.timers.set(
      date,
      setTimeout(() => {
        void this.flushWeek(date);
      }, 350),
    );
    this.notify();
  }
  /** Saves until the journal holds the local text, or stops at notes that changed elsewhere. */
  private async savePending(date: string, draft: NotesDraft) {
    let resent = false;
    while (draft.value !== draft.saved) {
      const value = draft.value;
      if (!draft.conflict) {
        try {
          const saved = await this.api.saveWeeklyNotes(date, value, draft.revision);
          draft.revision = saved.revision;
          draft.saved = value;
          continue;
        } catch (error) {
          if (toCommandError(error).code !== 'conflict') throw error;
        }
      }
      const stored = await this.api.weeklyReview(date);
      if (stored.notes === value) {
        // Already stored, for example by a save whose reply was lost: adopt its revision.
        draft.saved = value;
      } else if (stored.notes !== draft.saved || resent) {
        draft.conflict = { notes: stored.notes, revision: stored.revision };
        return;
      } else {
        // Only the revision moved on: send the text again, once, on the stored revision.
        resent = true;
      }
      draft.revision = stored.revision;
      draft.conflict = null;
    }
  }
  private async runWeek(date: string, generate?: GenerateSummary, choose?: Choice): Promise<void> {
    clearTimeout(this.timers.get(date));
    this.timers.delete(date);
    const previous = this.flights.get(date);
    const generationFailure: { error?: unknown } = {};
    const flight = (async () => {
      await previous;
      const draft = this.drafts.get(date);
      if (!draft) return;
      if (choose && draft.conflict) {
        choose(draft, draft.conflict);
        draft.conflict = null;
        draft.error = null;
        this.notify();
      }
      if (draft.value === draft.saved && !generate) return;
      draft.saving = true;
      draft.error = null;
      this.notify();
      try {
        await this.savePending(date, draft);
        if (generate) {
          try {
            await generate(date);
          } catch (error) {
            generationFailure.error = error;
          }
          // Typing stays available during generation; save those edits too.
          await this.savePending(date, draft);
        }
      } catch (error) {
        draft.error = toCommandError(error).message;
      } finally {
        draft.saving = false;
        this.notify();
      }
    })();
    this.flights.set(date, flight);
    await flight;
    if (this.flights.get(date) === flight) this.flights.delete(date);
    if ('error' in generationFailure) throw generationFailure.error;
  }
  flushWeek = (date: string) => this.runWeek(date);
  regenerateWeek = (date: string, generate: GenerateSummary) => this.runWeek(date, generate);
  /** Saves the local text over notes that changed elsewhere. */
  keepText = (date: string) =>
    this.runWeek(date, undefined, (draft, stored) => {
      draft.saved = stored.notes;
      draft.revision = stored.revision;
    });
  /** Replaces the local text with the notes that changed elsewhere. */
  loadSavedText = (date: string) =>
    this.runWeek(date, undefined, (draft, stored) => {
      draft.value = draft.saved = stored.notes;
      draft.revision = stored.revision;
    });
  hasPending = () =>
    [...this.drafts.values()].some(
      (draft) => draft.saving || draft.value !== draft.saved || draft.conflict !== null,
    );
  flush = async () => {
    await Promise.all([...this.drafts.keys()].map((date) => this.flushWeek(date)));
  };
  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer);
  }
}
