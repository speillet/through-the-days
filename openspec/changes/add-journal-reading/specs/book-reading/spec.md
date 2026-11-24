# book-reading

## Purpose

Make saved journal writing pleasant to reread chronologically without losing long text or the person's reading position.

Sources: README_THROUGH_THE_DAYS.md §7 and 20 case 6.

## ADDED Requirements

### Requirement: Chronological reading

Book View SHALL order entries chronologically by journal date and slot, skip empty dates by default, and offer a return to the calendar.

#### Scenario: Sparse journal

- **WHEN** the person advances through a journal with empty dates
- **THEN** navigation reaches the next saved entry without inventing blank entries.

### Requirement: Complete pagination

Book View SHALL show one entry per page with its complete saved document rendered once, scrolling for long content, selectable text, adjustable text size and a preserved reading position (D-012).

#### Scenario: Long formatted entry

- **WHEN** a long entry containing headings, Unicode text, and lists exceeds the reading viewport
- **THEN** the full text appears once in reading order, with no lost passages.

#### Scenario: Window resize

- **WHEN** the reading window changes from wide to narrow
- **THEN** the layout adapts while retaining a usable reading position.

### Requirement: Accessible reading controls

Book View SHALL support previous/next controls, arrow keys, trackpad navigation, full English date/slot headings, light/dark appearance, and reduced motion.

#### Scenario: Reduced-motion page turn

- **WHEN** the person turns a page with reduced motion enabled
- **THEN** the next content appears without a required page-turn animation.

#### Scenario: Horizontal and vertical gestures

- **WHEN** the person scrolls horizontally to another saved entry and then scrolls vertically
- **THEN** horizontal navigation changes the entry while vertical scrolling keeps the current entry.

### Requirement: Source context and current values

Book View SHALL retain the originating selection separately from shared filters, return to that source view with its context preserved, and show current saved check-in values subject to shared display preferences. An unavailable selection SHALL require an explicit recovery action.

#### Scenario: Return to a filtered timeline or week

- **WHEN** the person opens a timeline or weekly source in Book View and returns
- **THEN** the source's range, filters, layers and notes remain unchanged, and the correct dated slot was read.

#### Scenario: Insight-filtered reading selection

- **WHEN** the person reads a source from a weekly review or a win-filtered timeline
- **THEN** previous/next navigation uses the originating insight-eligible sources, including the same win permissions, without silently widening to the full owned journal.

#### Scenario: Selected sources removed

- **WHEN** the last source in a Book selection is removed
- **THEN** the app explains that it is unavailable and offers explicit actions to restart the selection or read all entries without changing the source view's filters.

#### Scenario: Saved score edited

- **WHEN** the person saves an energy change from 3 to 9 and reads that entry
- **THEN** Book View shows 9, matching Calendar, search sources, Trends and Weekly Review, unless score display is hidden.
