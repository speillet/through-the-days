// Morning and Evening for the open date, each with a neutral status in words.

import { Sunrise, Sunset } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import type { Slot } from '../../api/types';
import { classNames } from '../../components/classNames';
import { SLOT_LABELS } from '../../domain/copy';
import { ENTRY_STATUS_LABELS, type EntryStatus } from './status';

const SLOTS: readonly Slot[] = ['morning', 'evening'];
const ICONS = { morning: Sunrise, evening: Sunset } as const;

export function slotTabId(slot: Slot): string {
  return `slot-tab-${slot}`;
}

interface SlotTabsProps {
  slot: Slot;
  /** Null while the date's entries are still being read. */
  statuses: Record<Slot, EntryStatus | null>;
  panelId: string;
  onSelect(slot: Slot): void;
}

export function SlotTabs({ slot, statuses, panelId, onSelect }: SlotTabsProps) {
  const tabs = useRef<Record<Slot, HTMLButtonElement | null>>({ morning: null, evening: null });

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: Slot) {
    let target: Slot | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') target = current === 'morning' ? 'evening' : 'morning';
    else if (event.key === 'Home') target = 'morning';
    else if (event.key === 'End') target = 'evening';
    if (!target) return;
    event.preventDefault();
    tabs.current[target]?.focus();
    onSelect(target);
  }

  return (
    <div role="tablist" aria-label="Entries for this date" className="slot-tabs">
      {SLOTS.map((item) => {
        const Icon = ICONS[item];
        const selected = item === slot;
        return (
          <button
            key={item}
            ref={(element) => {
              tabs.current[item] = element;
            }}
            type="button"
            role="tab"
            id={slotTabId(item)}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            className={classNames('slot-tab', selected && 'slot-tab--selected')}
            onClick={() => onSelect(item)}
            onKeyDown={(event) => handleKeyDown(event, item)}
          >
            <Icon className="slot-tab__icon" aria-hidden="true" size={17} />
            <span className="slot-tab__label">{SLOT_LABELS[item]}</span>
            {statuses[item] ? (
              <span className="slot-tab__status">{ENTRY_STATUS_LABELS[statuses[item]]}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
