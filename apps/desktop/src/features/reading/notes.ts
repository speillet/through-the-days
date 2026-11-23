// One ordered save stream per week's authored notes, retained across view changes.
import type { WeeklyReview } from '../../api/types';
import { toCommandError } from '../../api/client';

interface NotesDraft {
  value: string;
  saved: string;
  revision: number;
  saving: boolean;
  error: string | null;
}
type SaveNotes = (date: string, notes: string, revision: number) => Promise<WeeklyReview>;
export class WeeklyNotesStore {
  private drafts = new Map<string, NotesDraft>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private flights = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private version = 0;
  constructor(private save: SaveNotes) {}
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
    return this.drafts.get(date) ?? { value: '', saved: '', revision: 0, saving: false, error: null };
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
  async flushWeek(date: string): Promise<void> {
    clearTimeout(this.timers.get(date));
    this.timers.delete(date);
    const existing = this.flights.get(date);
    if (existing) {
      await existing;
      return;
    }
    const draft = this.drafts.get(date);
    if (!draft || draft.value === draft.saved) return;
    const flight = (async () => {
      draft.saving = true;
      draft.error = null;
      this.notify();
      try {
        while (draft.value !== draft.saved) {
          const value = draft.value;
          const saved = await this.save(date, value, draft.revision);
          draft.revision = saved.revision;
          draft.saved = value;
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
    this.flights.delete(date);
  }
  hasPending = () => [...this.drafts.values()].some((draft) => draft.saving || draft.value !== draft.saved);
  flush = async () => {
    await Promise.all([...this.drafts.keys()].map((date) => this.flushWeek(date)));
  };
  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer);
  }
}
