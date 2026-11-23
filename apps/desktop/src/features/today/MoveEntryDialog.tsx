// "Change date or slot": moves the same entry, with its writing and answers, to
// another journal date or slot. An occupied destination is refused and neither
// entry changes.

import { useState } from 'react';
import type { CommandError, Slot } from '../../api/types';
import { Button } from '../../components/Button';
import { CalendarGrid } from '../../components/CalendarGrid';
import { Dialog } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import { RadioGroup } from '../../components/RadioGroup';
import { SLOT_LABELS } from '../../domain/copy';
import { formatLongDate } from '../../domain/dates';

export interface MoveEntryDialogProps {
  date: string;
  slot: Slot;
  today: string;
  onMove(date: string, slot: Slot): Promise<CommandError | null>;
  onMoved(date: string, slot: Slot): void;
  onClose(): void;
}

export function MoveEntryDialog({ date, slot, today, onMove, onMoved, onClose }: MoveEntryDialogProps) {
  const [targetDate, setTargetDate] = useState(date);
  const [targetSlot, setTargetSlot] = useState<Slot>(slot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move() {
    if (targetDate === date && targetSlot === slot) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    const refused = await onMove(targetDate, targetSlot);
    setBusy(false);
    if (refused) {
      setError(refused.message);
      return;
    }
    onMoved(targetDate, targetSlot);
  }

  return (
    <Dialog
      open
      title="Change date or slot"
      description="The entry keeps its writing and answers; only where it belongs changes."
      onClose={() => {
        if (!busy) onClose();
      }}
      className="move-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void move()}>
            Move entry
          </Button>
        </>
      }
    >
      <CalendarGrid
        value={targetDate}
        today={today}
        autoFocus
        onSelect={(next) => {
          setTargetDate(next);
          setError(null);
        }}
      />
      <p className="move-dialog__date">
        Journal date: <strong>{formatLongDate(targetDate)}</strong>
      </p>
      <RadioGroup
        legend="Slot"
        layout="row"
        value={targetSlot}
        options={[
          { value: 'morning', label: SLOT_LABELS.morning },
          { value: 'evening', label: SLOT_LABELS.evening },
        ]}
        onChange={(next) => {
          setTargetSlot(next);
          setError(null);
        }}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Dialog>
  );
}
