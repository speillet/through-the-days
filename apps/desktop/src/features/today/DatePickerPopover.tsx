// "Choose date": a small popover with the month grid. Escape or choosing a day
// closes it and returns focus to the button; clicking or tabbing away closes it.

import { CalendarDays } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { CalendarGrid } from '../../components/CalendarGrid';

interface DatePickerPopoverProps {
  value: string;
  today: string;
  onSelect(date: string): void;
}

export function DatePickerPopover({ value, today, onSelect }: DatePickerPopoverProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function closeOutside(event: PointerEvent) {
      const target = event.target instanceof Node ? event.target : null;
      if (target && (panelRef.current?.contains(target) || triggerRef.current?.contains(target))) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="date-picker">
      <Button
        ref={triggerRef}
        variant="secondary"
        size="small"
        icon={<CalendarDays size={15} />}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        Choose date
      </Button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Choose a journal date"
          className="date-picker__panel"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && !event.currentTarget.contains(next) && next !== triggerRef.current) {
              setOpen(false);
            }
          }}
        >
          <CalendarGrid
            value={value}
            today={today}
            autoFocus
            onSelect={(date) => {
              close();
              onSelect(date);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
