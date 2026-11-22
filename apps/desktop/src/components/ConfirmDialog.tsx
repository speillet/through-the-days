// Asks before a consequential action. For a destructive action focus starts on
// Cancel; a failed confirmation shows its English error and keeps the dialog open.

import { useRef, useState, type ReactNode } from 'react';
import { toCommandError } from '../api/client';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Notice } from './Notice';

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  /** What will happen, read when the dialog opens. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  /** May return a promise; a rejection is shown in the dialog. */
  onConfirm(): unknown;
  onCancel(): void;
}

export function ConfirmDialog({ open, ...props }: ConfirmDialogProps) {
  return open ? <OpenConfirmDialog {...props} /> : null;
}

function OpenConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}: Omit<ConfirmDialogProps, 'open'>) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (caught) {
      setError(toCommandError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      role="alertdialog"
      title={title}
      description={children}
      onClose={() => {
        if (!busy) onCancel();
      }}
      initialFocus={tone === 'danger' ? cancelRef : confirmRef}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => void confirm()}
            busy={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Dialog>
  );
}
