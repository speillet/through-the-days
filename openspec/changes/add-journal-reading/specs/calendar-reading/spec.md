# calendar-reading

## Purpose

Revisit chosen journal dates through an accessible month calendar and local search over the saved journal.

Sources: README_THROUGH_THE_DAYS.md §§6, 8, 16.3, 20 cases 4–5; requires the offline journal.

## ADDED Requirements

### Requirement: Month navigation and markers

The calendar SHALL provide previous/next month, Today, Monday-first dates, zero/one/two slot markers, and a keyboard-accessible date preview.

#### Scenario: Empty date

- **WHEN** a date has no entry
- **THEN** it appears neutrally without a negative score or fabricated marker.

#### Scenario: Two slots

- **WHEN** both Morning and Evening entries exist on a selected date
- **THEN** the preview identifies both entries and their distinct values.

#### Scenario: Keyboard date selection

- **WHEN** the person moves with arrows and activates a date
- **THEN** the same date and saved entries open as with pointer selection.

### Requirement: Consistent saved observations

The calendar SHALL show the same current saved entry content and check-in values as the editor and other reading views.

#### Scenario: Edited score

- **WHEN** the person saves a changed energy score and opens the calendar preview
- **THEN** the preview shows that saved value without a stale independent copy.

### Requirement: Local search and filtering

The system SHALL provide local full-text search and combinable journal filters while preserving exact source navigation and original-language excerpts.

#### Scenario: Unicode search

- **WHEN** the person searches synthetic non-English journal text offline
- **THEN** matching saved text is found under the documented search rules and opens its source entry.

#### Scenario: Edit invalidates search

- **WHEN** an entry is edited so that a previous match disappears
- **THEN** search no longer returns a stale match for the old version.

#### Scenario: Formatted part of a word

- **WHEN** the person formats part of a saved word, such as "after" in bold within "afternoon", and searches the journal
- **THEN** search finds the entry by the whole word but not by the formatted part alone, and its excerpt shows the text without a line break where the formatting changes.
