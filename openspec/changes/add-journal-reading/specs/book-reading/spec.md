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
