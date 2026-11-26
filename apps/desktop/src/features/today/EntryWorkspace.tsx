// One entry: writing depth, the optional check-in beside the journal page, the
// editor, save state and completion. Nothing is saved until the first answer or
// keystroke; from then on every change is saved progressively. An entry whose
// writing this version cannot edit exactly stays read-only, so it is never changed.

import { CalendarClock, FileText, Leaf, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { Depth, Entry, Slot } from '../../api/types';
import { Button } from '../../components/Button';
import { classNames } from '../../components/classNames';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Notice } from '../../components/Notice';
import { RadioGroup } from '../../components/RadioGroup';
import { DEPTH_OPTIONS, SLOT_LABELS } from '../../domain/copy';
import { formatLongDate } from '../../domain/dates';
import { EMPTY_DOCUMENT, newDraft } from '../../domain/entry';
import { useEntryAutosave, type AutosaveSnapshot } from '../../state/autosave';
import { useFocusMode } from '../../state/focus';
import { usePreferences } from '../../state/preferences';
import { CheckIn, QuickCheckIn } from '../checkin/CheckIn';
import { canEditExactly } from '../editor/content';
import { JournalEditor, type JournalEditorHandle } from '../editor/JournalEditor';
import { MarkdownDialog } from '../editor/MarkdownDialog';
import { CompletionControl } from './CompletionControl';
import { MoveEntryDialog } from './MoveEntryDialog';
import { SaveFailure, SaveStatus } from './SaveStatus';
import { entryStatus, type EntryStatus } from './status';

/**
 * saved: nothing is left unsaved; retry: a save failed and may succeed later;
 * reload: the save can never succeed (the saved entry changed, disappeared or its
 * slot is taken), so only reloading the saved version can resolve it.
 */
export type FlushOutcome = 'saved' | 'retry' | 'reload';

export interface EntryWorkspaceHandle {
  /** Saves pending input and says whether anything is left unsaved, and why. */
  flush(): Promise<FlushOutcome>;
  /** Whether this slot holds an entry (saved, or created by an answer or keystroke). */
  hasEntry(): boolean;
  /** Puts the caret at the end of the writing. */
  focusEditor(): void;
}

interface EntryWorkspaceProps {
  date: string;
  slot: Slot;
  /** The saved entry for this date and slot, or null. */
  initial: Entry | null;
  today: string;
  autosaveDelayMs?: number;
  onStatusChange(slot: Slot, status: EntryStatus): void;
  /** Called whenever every change is saved. */
  onSaved?(): void;
  /** Called with each version of the entry the journal acknowledges. */
  onAcknowledged?(entry: Entry): void;
  onMoved(date: string, slot: Slot): void;
  onTrashed(): void;
  onReload(): void;
  ref?: Ref<EntryWorkspaceHandle>;
}

function ignoreChange(): void {}

const PLACEHOLDERS: Record<Slot, string> = {
  morning: "Write freely. What's on your mind this morning?",
  evening: 'Write freely. How was today?',
};

function isSaveShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's';
}

function flushOutcome(saved: boolean, snapshot: AutosaveSnapshot): FlushOutcome {
  if (saved) return 'saved';
  return snapshot.needsReload ? 'reload' : 'retry';
}

/** Escape pressed while writing: the editor marks it handled, but it still means "leave focus mode". */
function isFromEditor(event: KeyboardEvent): boolean {
  return event.target instanceof Element && event.target.closest('.ProseMirror') !== null;
}

export function EntryWorkspace({
  date,
  slot,
  initial,
  today,
  autosaveDelayMs,
  onStatusChange,
  onSaved,
  onAcknowledged,
  onMoved,
  onTrashed,
  onReload,
  ref,
}: EntryWorkspaceProps) {
  const { preferences, visibility } = usePreferences();
  const { focusMode, setFocusMode } = useFocusMode();
  const pageTitleId = useId();
  const editorId = useId();
  const editorRef = useRef<JournalEditorHandle>(null);
  // Chosen before the first interaction; it becomes the new draft's depth.
  const [pendingDepth, setPendingDepth] = useState<Depth | null>(null);
  const autosave = useEntryAutosave({
    date,
    slot,
    initial,
    create: () => newDraft(date, slot, preferences.timeZone, pendingDepth ?? preferences.defaultDepth),
    delayMs: autosaveDelayMs,
  });
  const entry = autosave.entry;
  const [blank] = useState(() => newDraft(date, slot, preferences.timeZone, preferences.defaultDepth));
  const [initialDocument] = useState(() => entry?.document ?? EMPTY_DOCUMENT);
  // Any save would carry writing the journal may refuse or this version would change,
  // so the whole entry is read-only; it can still be moved or put in the Trash.
  const [readOnly] = useState(() => !canEditExactly(initialDocument));
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [trashing, setTrashing] = useState(false);

  const values = entry ?? blank;
  const depth = entry?.depth ?? pendingDepth ?? preferences.defaultDepth;
  const status = entryStatus(entry);
  const showCheckIn = depth !== 'quick' || visibility.scores;
  const { flush, saveNow } = autosave;
  const latest = autosave.current;
  const update = readOnly ? ignoreChange : autosave.update;

  useImperativeHandle(
    ref,
    () => ({
      flush: async () => flushOutcome(await flush(), latest()),
      hasEntry: () => latest().entry !== null,
      focusEditor: () => editorRef.current?.focus('end'),
    }),
    [latest, flush],
  );

  useEffect(() => {
    onStatusChange(slot, status);
  }, [onStatusChange, slot, status]);

  useEffect(() => {
    if (autosave.state === 'saved') onSaved?.();
  }, [autosave.state, onSaved]);

  useEffect(() => {
    if (autosave.saved) onAcknowledged?.(autosave.saved);
  }, [autosave.saved, onAcknowledged]);

  // ⌘S saves now, wherever focus is in the open entry.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isSaveShortcut(event)) return;
      event.preventDefault();
      void saveNow();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [saveNow]);

  // Escape leaves focus mode, also while writing. Dialogs and popovers handle their
  // own Escape first (they prevent its default), and focus mode then stays on.
  useEffect(() => {
    if (!focusMode) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || (event.defaultPrevented && !isFromEditor(event))) return;
      setFocusMode(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [focusMode, setFocusMode]);

  function changeDepth(next: Depth) {
    if (entry) update((current) => (current.depth === next ? current : { ...current, depth: next }));
    else setPendingDepth(next);
  }

  function toggleFocusMode() {
    const next = !focusMode;
    setFocusMode(next);
    if (next) editorRef.current?.focus();
  }

  const writeDirectly = () => editorRef.current?.focus();

  return (
    <div className="entry-workspace">
      {focusMode ? null : (
        <RadioGroup
          legend="Writing depth"
          hint="Optional. Switching keeps everything you wrote and answered."
          layout="row"
          className="depth-selector"
          disabled={readOnly}
          value={depth}
          options={DEPTH_OPTIONS.map((option) => ({
            value: option.id,
            label: option.label,
            description: visibility.durations ? option.duration : undefined,
          }))}
          onChange={changeDepth}
        />
      )}
      {!focusMode && preferences.gentle ? (
        <p className="today-note">
          <Leaf aria-hidden="true" size={16} />
          Gentle view is on: scores and tracking prompts are hidden. Nothing was deleted.
        </p>
      ) : null}
      {!focusMode && depth === 'deep' ? (
        <Notice tone="info" politeness="off" className="deep-note">
          Guided worksheets for Deep Reflection arrive with the CBT exercises milestone and are not available yet.
          For now, Deep Reflection gives you the full check-in and free writing.
        </Notice>
      ) : null}

      <div className={classNames('workspace', (!showCheckIn || focusMode) && 'workspace--single')}>
        {showCheckIn ? (
          <div className="workspace__checkin" hidden={focusMode}>
            {depth === 'quick' ? (
              <QuickCheckIn values={values} readOnly={readOnly} onChange={update} />
            ) : (
              <CheckIn
                slot={slot}
                values={values}
                showScores={visibility.scores}
                readOnly={readOnly}
                onChange={update}
                onWriteDirectly={writeDirectly}
              />
            )}
          </div>
        ) : null}

        <section className="workspace__page journal-page" aria-labelledby={pageTitleId}>
          <header className="journal-page__header">
            <h2 id={pageTitleId} className="slot-label">
              {SLOT_LABELS[slot]} journal
            </h2>
            <SaveStatus state={autosave.state} />
          </header>
          {autosave.state === 'failed' && autosave.error ? (
            <SaveFailure
              error={autosave.error}
              needsReload={autosave.needsReload}
              onRetry={() => void saveNow()}
              onReload={() => {
                autosave.discard();
                onReload();
              }}
            />
          ) : null}
          <JournalEditor
            ref={editorRef}
            id={editorId}
            initialContent={initialDocument}
            label={`${SLOT_LABELS[slot]} journal, ${formatLongDate(date)}`}
            placeholder={PLACEHOLDERS[slot]}
            showToolbar={visibility.toolbar}
            showWordCount={visibility.wordCount}
            onChange={(document) => update((current) => ({ ...current, document }))}
          />
          <footer className="journal-page__footer">
            <CompletionControl
              entry={entry}
              showControl={visibility.completionPrompts && !readOnly}
              showScores={visibility.scores}
              onMarkComplete={autosave.markComplete}
              onMarkDraft={autosave.markDraft}
            />
            <div className="journal-page__tools">
              <Button
                variant="quiet"
                size="small"
                icon={<FileText size={15} />}
                onClick={() => setMarkdown(editorRef.current?.getMarkdown() ?? '')}
              >
                View Markdown
              </Button>
              <Button
                variant="quiet"
                size="small"
                aria-pressed={focusMode}
                icon={focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                onClick={toggleFocusMode}
              >
                Focus mode
              </Button>
            </div>
          </footer>
        </section>
      </div>

      {!focusMode && entry ? (
        <div className="entry-actions" role="group" aria-label="Entry actions">
          <Button variant="secondary" size="small" icon={<CalendarClock size={15} />} onClick={() => setMoving(true)}>
            Change date or slot
          </Button>
          <Button variant="quiet" size="small" icon={<Trash2 size={15} />} onClick={() => setTrashing(true)}>
            Move to Trash
          </Button>
        </div>
      ) : null}

      {markdown !== null ? <MarkdownDialog markdown={markdown} onClose={() => setMarkdown(null)} /> : null}
      {moving ? (
        <MoveEntryDialog
          date={date}
          slot={slot}
          today={today}
          onMove={autosave.move}
          onMoved={(nextDate, nextSlot) => {
            setMoving(false);
            onMoved(nextDate, nextSlot);
          }}
          onClose={() => setMoving(false)}
        />
      ) : null}
      <ConfirmDialog
        open={trashing}
        tone="danger"
        title="Move this entry to Trash?"
        confirmLabel="Move to Trash"
        onCancel={() => setTrashing(false)}
        onConfirm={async () => {
          const error = await autosave.trash();
          if (error) throw error;
          setTrashing(false);
          onTrashed();
        }}
      >
        <p>You can restore it from Trash for 30 days.</p>
      </ConfirmDialog>
    </div>
  );
}
