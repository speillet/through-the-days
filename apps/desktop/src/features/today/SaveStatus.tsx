// The save state beside the journal page, announced politely, and the failure
// notice that stays visible (also in focus mode and Gentle view) until a save
// succeeds. A failure keeps the person's input on screen for a retry.

import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import type { CommandError } from '../../api/types';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { SAVE_STATE_LABELS } from '../../domain/copy';
import type { SaveState } from '../../state/autosave';

const LABELS: Record<SaveState, string> = {
  idle: '',
  pending: SAVE_STATE_LABELS.saving,
  saving: SAVE_STATE_LABELS.saving,
  saved: SAVE_STATE_LABELS.saved,
  failed: SAVE_STATE_LABELS.failed,
};

export function SaveStatus({ state }: { state: SaveState }) {
  const Icon =
    state === 'saved' ? CircleCheck : state === 'failed' ? CircleAlert : state === 'idle' ? null : LoaderCircle;
  return (
    <p className={`save-status save-status--${state}`} role="status" aria-live="polite">
      {Icon ? <Icon className="save-status__icon" aria-hidden="true" size={14} strokeWidth={2.25} /> : null}
      <span>{LABELS[state]}</span>
    </p>
  );
}

export function SaveFailure({
  error,
  needsReload,
  onRetry,
  onReload,
}: {
  error: CommandError;
  needsReload: boolean;
  onRetry(): void;
  onReload(): void;
}) {
  return (
    <Notice
      tone="error"
      className="save-failure"
      actions={
        needsReload ? (
          <Button variant="secondary" size="small" onClick={onReload}>
            Reload saved version
          </Button>
        ) : (
          <Button variant="secondary" size="small" onClick={onRetry}>
            {SAVE_STATE_LABELS.retry}
          </Button>
        )
      }
    >
      <p>{error.message}</p>
      <p>
        {needsReload
          ? 'Reloading shows the saved version of this entry. Changes made on this page since it was saved are not kept.'
          : 'Your writing stays on this page until it is saved.'}
      </p>
    </Notice>
  );
}
