// Trash (D-003): deleted entries stay restorable for 30 days. Restoring never
// overwrites an entry already in the same date and slot, and permanent deletion
// says plainly that earlier encrypted backups may still contain the entry. An
// entry being restored can't be deleted permanently, and an action that finds
// its entry already gone from the trash says so instead of reporting success.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toCommandError, useApi } from '../../api/client';
import type { CommandError, Entry, TrashItem } from '../../api/types';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Notice, type NoticeTone } from '../../components/Notice';
import { VisuallyHidden } from '../../components/VisuallyHidden';
import { SLOT_LABELS } from '../../domain/copy';
import { formatDate, formatDateTime, formatLongDate, todayIn } from '../../domain/dates';
import { documentText, isBlank } from '../../domain/entry';
import { usePreferences } from '../../state/preferences';
import { BACKUPS_KEPT } from '../backup/status';
import './trash.css';

/** Graphemes shown in a preview before it is shortened. */
export const PREVIEW_LENGTH = 160;

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter('en-GB', { granularity: 'grapheme' }).segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

/**
 * A short, faithful preview of the person's own words: whitespace is collapsed and
 * a long text is shortened at a word boundary, but nothing is translated or rewritten.
 */
export function previewText(entry: Pick<Entry, 'document' | 'title'>): string {
  const text = documentText(entry.document).replace(/\s+/gu, ' ').trim();
  const source = text === '' ? entry.title.replace(/\s+/gu, ' ').trim() : text;
  const parts = graphemes(source);
  if (parts.length <= PREVIEW_LENGTH) return source;
  const cut = parts.slice(0, PREVIEW_LENGTH).join('');
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > cut.length * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** "the Morning entry from Sunday 22 November 2026" */
export function describeEntry(entry: Pick<Entry, 'date' | 'slot'>): string {
  return `the ${SLOT_LABELS[entry.slot]} entry from ${formatLongDate(entry.date)}`;
}

function capitalise(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function conflictMessage(entry: Entry): string {
  return `${formatLongDate(entry.date)} already has a ${SLOT_LABELS[entry.slot]} entry, so this one can’t be restored there. Nothing was overwritten: both entries are kept. To restore this one, first move the entry that is there now to the trash.`;
}

interface Feedback {
  tone: NoticeTone;
  text: string;
}

export function TrashView() {
  const api = useApi();
  const { timeZone } = usePreferences().preferences;
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<TrashItem | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const load = useCallback(async () => {
    try {
      // Expired entries go first, so the list never offers one that is past its 30 days.
      await api.purgeExpiredTrash();
    } catch {
      // The routine purges again later and at the next launch.
    }
    try {
      const listed = await api.listTrash();
      setItems(listed);
      // A confirmation never outlives its entry in the list.
      setConfirming((current) =>
        current && listed.some((item) => item.entry.id === current.entry.id) ? current : null,
      );
      setLoadError(null);
    } catch (caught) {
      setLoadError(toCommandError(caught).message);
      setItems((current) => current ?? []);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  // When an item leaves the list, keep keyboard focus nearby rather than losing it.
  useEffect(() => {
    if (focusIndex === null || items === null) return;
    const buttons = listRef.current?.querySelectorAll<HTMLElement>('[data-trash-restore]');
    const target =
      buttons && buttons.length > 0 ? buttons[Math.min(focusIndex, buttons.length - 1)] : headingRef.current;
    target?.focus();
    setFocusIndex(null);
  }, [focusIndex, items]);

  function remove(id: string) {
    const index = items?.findIndex((item) => item.entry.id === id) ?? 0;
    setItems((current) => current?.filter((item) => item.entry.id !== id) ?? current);
    setConfirming((current) => (current?.entry.id === id ? null : current));
    setFocusIndex(Math.max(0, index));
  }

  /**
   * The entry was restored, deleted or expired before this action reached it: say so rather
   * than report what did not happen, and show the trash as it now is.
   */
  async function noLongerInTrash(id: string) {
    const index = items?.findIndex((item) => item.entry.id === id) ?? 0;
    setFeedback({ tone: 'error', text: 'That entry is no longer in the trash.' });
    await load();
    setFocusIndex(Math.max(0, index));
  }

  function setItemError(id: string, message: string | null) {
    setItemErrors((current) => {
      const next = { ...current };
      if (message === null) delete next[id];
      else next[id] = message;
      return next;
    });
  }

  async function restore(item: TrashItem) {
    if (busyId) return;
    setBusyId(item.entry.id);
    setFeedback(null);
    setItemError(item.entry.id, null);
    try {
      const restored = await api.restoreEntry(item.entry.id);
      remove(item.entry.id);
      setFeedback({ tone: 'success', text: `${capitalise(describeEntry(restored))} is back in your journal.` });
    } catch (caught) {
      const error: CommandError = toCommandError(caught);
      if (error.code === 'occupied') {
        setItemError(item.entry.id, conflictMessage(item.entry));
      } else if (error.code === 'notFound') {
        await noLongerInTrash(item.entry.id);
      } else {
        setItemError(item.entry.id, error.message);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deletePermanently(item: TrashItem) {
    try {
      await api.deleteEntryPermanently(item.entry.id);
    } catch (caught) {
      const error = toCommandError(caught);
      if (error.code !== 'notFound') throw error;
      // Nothing was deleted: a restore may have brought the entry back to the journal first.
      setConfirming(null);
      await noLongerInTrash(item.entry.id);
      return;
    }
    setConfirming(null);
    remove(item.entry.id);
    setFeedback({
      tone: 'success',
      text: 'The entry was deleted permanently. Earlier backups may still contain it until they are pruned.',
    });
  }

  return (
    <div className="view trash">
      <header className="view-header">
        <h1 className="view-title" ref={headingRef} tabIndex={-1}>
          Trash
        </h1>
      </header>
      <p className="trash__intro">
        Deleted entries are kept here for 30 days. Restore one to put it back in your journal, or delete it permanently.
      </p>

      {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}
      {loadError ? <Notice tone="error">{loadError}</Notice> : null}

      {items === null ? (
        <p role="status">Loading the trash…</p>
      ) : items.length === 0 ? (
        <div className="trash__empty panel">
          <p className="trash__empty-title">The trash is empty.</p>
          <p>
            When you delete an entry, it stays here for 30 days, so you can restore it if you change your mind. After
            that, it is removed from the journal on this Mac.
          </p>
        </div>
      ) : (
        <ul className="trash__list" ref={listRef} aria-label="Deleted entries">
          {items.map((item) => {
            const { entry } = item;
            const preview = previewText(entry);
            const described = describeEntry(entry);
            const itemError = itemErrors[entry.id];
            return (
              <li key={entry.id} className="trash-item panel">
                <h2
                  className="trash-item__title"
                  aria-label={`${formatLongDate(entry.date)}, ${SLOT_LABELS[entry.slot]}`}
                >
                  {formatLongDate(entry.date)} <span className="trash-item__slot">{SLOT_LABELS[entry.slot]}</span>
                </h2>
                {isBlank(preview) ? (
                  <p className="trash-item__preview trash-item__preview--empty">No writing in this entry.</p>
                ) : (
                  <p className="trash-item__preview">{preview}</p>
                )}
                <p className="trash-item__meta">
                  <span>Deleted {formatDateTime(item.deletedAt, timeZone)}</span>
                  <span>Kept until {formatDate(todayIn(timeZone, new Date(item.expiresAt * 1000)))}</span>
                </p>
                {itemError ? (
                  <Notice tone="error" title="Not restored">
                    {itemError}
                  </Notice>
                ) : null}
                <div className="trash-item__actions">
                  <Button data-trash-restore="" busy={busyId === entry.id} onClick={() => void restore(item)}>
                    Restore <VisuallyHidden>{described}</VisuallyHidden>
                  </Button>
                  <Button variant="quiet" disabled={busyId === entry.id} onClick={() => setConfirming(item)}>
                    Delete permanently <VisuallyHidden>{described}</VisuallyHidden>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title="Delete this entry permanently?"
        confirmLabel="Delete permanently"
        tone="danger"
        onCancel={() => setConfirming(null)}
        onConfirm={() => (confirming ? deletePermanently(confirming) : undefined)}
      >
        {confirming ? (
          <>
            <p>
              {capitalise(describeEntry(confirming.entry))} will be removed from the journal on this Mac. You can’t undo
              this.
            </p>
            <p>
              Earlier encrypted backups may still contain it until they are pruned (the {BACKUPS_KEPT} most recent
              backups are kept), or until you delete those backup files yourself.
            </p>
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
