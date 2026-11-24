// The collapsible navigation rail. Working views are buttons (arrow keys move
// between them); later milestones are listed as plainly unavailable text, never
// as links to placeholder screens.

import {
  BookOpen,
  BookOpenText,
  CalendarDays,
  ChartLine,
  MessagesSquare,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sprout,
  Tags,
  Target,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useId, useRef, type KeyboardEvent } from 'react';
import { APP_NAME, NOT_AVAILABLE_YET, UNAVAILABLE_VIEWS } from '../domain/copy';
import { useNavigation, type View } from '../state/navigation';
import { usePreferences } from '../state/preferences';
import { classNames } from './classNames';
import { TAB_STOP } from './keyboard';

interface RailItem {
  view: View;
  label: string;
  Icon: LucideIcon;
}

const PRIMARY_ITEMS: readonly RailItem[] = [
  { view: 'today', label: 'Today', Icon: NotebookPen },
  { view: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { view: 'journal', label: 'My Journal', Icon: BookOpenText },
  { view: 'book', label: 'Book View', Icon: BookOpen },
  { view: 'trends', label: 'Trends', Icon: ChartLine },
  { view: 'weekly', label: 'Weekly Review', Icon: CalendarDays },
  { view: 'path', label: 'The Path So Far', Icon: BookOpenText },
];

const UTILITY_ITEMS: readonly RailItem[] = [
  { view: 'trash', label: 'Trash', Icon: Trash2 },
  { view: 'settings', label: 'Settings', Icon: Settings },
];

const LATER_ICONS: Record<string, LucideIcon> = {
  Calendar: CalendarDays,
  'My Journal': BookOpenText,
  'Book View': BookOpen,
  Trends: ChartLine,
  'Keywords & Tags': Tags,
  'Goals & Counters': Target,
  'CBT Exercises': Sprout,
  ChatGPT: MessagesSquare,
};

const MOVE_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

export function NavigationRail({ id = 'navigation-rail' }: { id?: string }) {
  const { view, navigate } = useNavigation();
  const { preferences, update } = usePreferences();
  const open = preferences.sidebarOpen;
  const navRef = useRef<HTMLElement>(null);
  const laterLabelId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!MOVE_KEYS.has(event.key) || !navRef.current) return;
    const items = Array.from(navRef.current.querySelectorAll<HTMLButtonElement>('[data-rail-item]'));
    const index = items.findIndex((item) => item === document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else next = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  }

  function renderItem({ view: target, label, Icon }: RailItem) {
    const active = view === target;
    return (
      <li key={target}>
        <button
          type="button"
          data-rail-item=""
          tabIndex={TAB_STOP}
          className={classNames('rail__item', active && 'rail__item--active')}
          aria-current={active ? 'page' : undefined}
          title={open ? undefined : label}
          onClick={() => navigate(target)}
        >
          <Icon className="rail__icon" aria-hidden="true" size={18} strokeWidth={1.75} />
          <span className={open ? 'rail__label' : 'visually-hidden'}>{label}</span>
        </button>
      </li>
    );
  }

  return (
    <nav
      id={id}
      ref={navRef}
      aria-label="Main"
      className={classNames('rail', !open && 'rail--collapsed')}
      onKeyDown={handleKeyDown}
    >
      <div className="rail__header">
        {open ? <span className="rail__brand">{APP_NAME}</span> : null}
        <button
          type="button"
          className="rail__toggle"
          tabIndex={TAB_STOP}
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          title={open ? 'Collapse sidebar' : 'Expand sidebar'}
          onClick={() => void update({ sidebarOpen: !open })}
        >
          {open ? (
            <PanelLeftClose aria-hidden="true" size={18} strokeWidth={1.75} />
          ) : (
            <PanelLeftOpen aria-hidden="true" size={18} strokeWidth={1.75} />
          )}
        </button>
      </div>

      <ul className="rail__list">{PRIMARY_ITEMS.map(renderItem)}</ul>

      {open ? (
        <div className="rail__later">
          <p id={laterLabelId} className="rail__group-label">
            Coming later
          </p>
          <ul className="rail__list" aria-labelledby={laterLabelId}>
            {UNAVAILABLE_VIEWS.map((label) => {
              const Icon = LATER_ICONS[label];
              return (
                <li key={label} className="rail__unavailable" aria-disabled="true">
                  <Icon className="rail__icon" aria-hidden="true" size={18} strokeWidth={1.75} />
                  <span className="rail__label">{label}</span>
                  <span className="rail__badge">{NOT_AVAILABLE_YET}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <ul className="rail__list rail__list--end">{UTILITY_ITEMS.map(renderItem)}</ul>
    </nav>
  );
}
