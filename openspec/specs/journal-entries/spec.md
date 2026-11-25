# journal-entries Specification

## Purpose

Preserve each chosen journal date and slot while allowing partial writing, later completion, and conflict-safe editing.

Sources: README_THROUGH_THE_DAYS.md §§4, 11.1, 14.1, 20 cases 1–3 and 7; D-002.

## Requirements

### Requirement: Two independent slots

The system SHALL allow at most one active Morning entry and one active Evening entry per valid journal date, each with independent content and check-in values.

#### Scenario: Independent observations

- **WHEN** Morning mood/energy are 2/3 and Evening mood/energy are 7/6 on one date
- **THEN** both observations retain their own values after saving and reopening.

#### Scenario: Occupied destination

- **WHEN** creation or a date/slot edit targets an occupied active slot
- **THEN** the operation reports a conflict and neither entry is overwritten.

#### Scenario: One entry is enough

- **WHEN** the person keeps only a Morning entry or only an Evening entry on a journal date
- **THEN** the other slot stays empty without pressure, a missing-entry warning, or a fabricated score.

### Requirement: Chosen civil date

The system SHALL default new entries to the current civil date in the configured time zone, permit explicit date correction, and preserve existing chosen dates across midnight and time-zone changes.

#### Scenario: Writing after midnight

- **WHEN** the person starts at 00:30 and explicitly selects the previous date
- **THEN** the entry belongs to that selected date and chosen slot.

#### Scenario: Open entry crosses midnight

- **WHEN** an entry remains open when the clock crosses midnight
- **THEN** subsequent saves keep its selected journal date.

#### Scenario: Shown again after midnight

- **WHEN** Today shows the current date with no entry open, and its window is reported hidden across midnight, then reported visible again without regaining focus
- **THEN** Today moves on to the new date as soon as the window is reported visible, so the first answer or keystroke starts the entry on that date.

#### Scenario: Travel

- **WHEN** the configured time zone changes after entries were saved
- **THEN** those entries retain their journal dates and slot identities.

#### Scenario: First and last journal dates

- **WHEN** the person moves Today's date by day or with the date picker to 1 January 0001 or 31 December 9999
- **THEN** the step past that date is unavailable and the open date remains a valid journal date.

### Requirement: Partial drafts

The system SHALL persist partial entries without requiring scores, reflection answers, or non-empty writing, and allow the person to reopen them later.

#### Scenario: Writing only

- **WHEN** the person writes without recording mood or energy, saves, and reopens
- **THEN** the text is restored as a draft without fabricated scores.

#### Scenario: Check-in only

- **WHEN** the person records an activity without writing journal prose
- **THEN** the partial record remains recoverable.

### Requirement: Completion integrity

The system SHALL permit completed status only when writing is non-empty and mood and energy are valid, preserving all optional unanswered fields as missing.

#### Scenario: Incomplete completion request

- **WHEN** the person requests completion with empty writing or a missing required score
- **THEN** completion is refused with an English explanation and the saved draft remains available.

#### Scenario: Valid completion

- **WHEN** the person completes an entry with writing, mood 0, energy 10, and no pride answer
- **THEN** the entry can be complete; pride remains missing rather than zero.

### Requirement: Safe content editing

The system SHALL keep the entry and its structured answers when journal prose is cleared and SHALL preserve the completion invariant after edits.

#### Scenario: Cleared writing

- **WHEN** the person removes all prose from a completed entry
- **THEN** the entry remains recoverable with its check-in intact and is no longer treated as complete.
