# calendar-reading Specification

## Purpose

Revisit chosen journal dates through an accessible month calendar and local search over the saved journal.

Sources: README_THROUGH_THE_DAYS.md §§6, 8, 16.3, 20 cases 4–5; requires the offline journal.

## Requirements

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

#### Scenario: First and last months

- **WHEN** the calendar shows January 0001 or December 9999
- **THEN** every date of that month is shown, no date before 1 January 0001 or after 31 December 9999 is offered, and month paging and keyboard moves stop at that limit.

#### Scenario: Today after paging

- **WHEN** the person pages the calendar to another month and activates Today, including when today is already the selected date
- **THEN** the calendar shows today's month, with today's date as its keyboard stop and in the preview.

#### Scenario: Today followed past midnight

- **WHEN** the person activates Today and the clock then passes midnight while the app stays open
- **THEN** the calendar selects and previews the new date, as when no date was chosen.

### Requirement: Consistent saved observations

The calendar SHALL show the same current saved entry content and check-in values as the editor and other reading views.

#### Scenario: Edited score

- **WHEN** the person saves a changed energy score and opens the calendar preview
- **THEN** the preview shows that saved value without a stale independent copy.

#### Scenario: Refresh keeps the reading place

- **WHEN** an autosave, another saved change or the person's return to the app refreshes an open reading view such as Calendar or My Journal
- **THEN** the view keeps showing its content, browsed month, keyboard focus and text selection until the current saved version replaces that content, and a failed refresh shows its error instead of the earlier content.

### Requirement: Local search and filtering

The system SHALL provide local full-text search and combinable journal filters while preserving exact source navigation and original-language excerpts.

#### Scenario: Unicode search

- **WHEN** the person searches synthetic non-English journal text offline
- **THEN** matching saved text is found under the documented search rules and opens its source entry.

#### Scenario: Punctuation beside searched words

- **WHEN** the person searches saved words together with punctuation or an emoji that search does not index, such as "pourquoi ?", "« journée »" or "paisible 🌿"
- **THEN** My Journal, Calendar, Book View, Trends and The Path So Far show the same results as a search for those words alone, and a search made only of such characters matches no entry.

#### Scenario: Minimum score that is not a whole score

- **WHEN** the person types a minimum score that is not a whole number from 0 to 10, such as 7.5, 11 or -1
- **THEN** the filters keep their previous minimum, and the reading views that share them keep their results without an error.

#### Scenario: Words in text written without spaces

- **WHEN** the person searches characters that appear in the same order inside saved Chinese, Japanese, Korean or Thai text, such as "散歩" in "今日は公園を散歩した。", "公园" in "今天我去公园散步了。", "เดินเล่น" in "วันนี้ฉันไปเดินเล่นที่สวน" or "학교" in "학교에"
- **THEN** search finds that entry, and characters that are not consecutive and in that order in the saved text, such as "公園散歩" or "歩散", match no entry.

#### Scenario: Edit invalidates search

- **WHEN** an entry is edited so that a previous match disappears
- **THEN** search no longer returns a stale match for the old version.

#### Scenario: Formatted part of a word

- **WHEN** the person formats part of a saved word, such as "after" in bold within "afternoon", and searches the journal
- **THEN** search finds the entry by the whole word but not by the formatted part alone, and its excerpt shows the text without a line break where the formatting changes.

#### Scenario: Filters change while another month is shown

- **WHEN** the person browses another month in Calendar and then types a search or changes a filter
- **THEN** the calendar stays in place on that month while the matching entries load, showing no slot markers until they arrive.
