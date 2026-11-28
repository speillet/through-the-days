# local-persistence Specification

## Purpose

Keep acknowledged journal revisions durable across restarts and failures while preserving coherent entry and reflection data.

Sources: README_THROUGH_THE_DAYS.md §§10–12, 19.3, 20 cases 3, 9, 12–13; durability is an engineering clarification.

## Requirements

### Requirement: Atomic acknowledged revisions

The system SHALL acknowledge a saved entry revision only after its writing and structured answers commit together, without exposing a partially saved revision.

#### Scenario: Interrupted transaction

- **WHEN** a failure interrupts saving writing together with check-in answers
- **THEN** reopening exposes the previous coherent revision rather than a mixture of versions.

#### Scenario: Crash after saved acknowledgment

- **WHEN** the app terminates after reporting Saved
- **THEN** reopening restores the exact acknowledged writing and answers.

### Requirement: Progressive autosave and errors

The system SHALL progressively save from the first interaction, distinguish pending, saved, and failed states, and retain unsaved input for retry when persistence fails.

#### Scenario: Resume writing after an autosave

- **WHEN** the person pauses long enough for an autosave, continues writing in the same entry, and the app acknowledges the final edit
- **THEN** reopening the journal restores the complete entry with the text written before and after the pause.

#### Scenario: Disk or lock failure

- **WHEN** a save fails while the person is writing
- **THEN** the interface shows an English failure state, retains the current input, and offers retry without reporting Saved.

#### Scenario: Retry from the failure notice

- **WHEN** the person chooses Try again in the save failure notice
- **THEN** the notice stays, with Try again busy and keeping keyboard focus, until the journal answers; a repeated failure leaves the focus there, and once the entry is saved the notice goes and focus returns to the writing with the caret where it was.

#### Scenario: Partial reflection restart

- **WHEN** a partially answered check-in is acknowledged and the app is closed
- **THEN** the same partial answers are restored without requiring completion.

#### Scenario: Pending save during supported quit

- **WHEN** a supported app-quit request is waiting for a save or cannot obtain a renderer flush acknowledgement
- **THEN** the app remains open with unacknowledged input available for retry; a timeout or event failure does not authorise exit.

#### Scenario: Leaving an entry whose save failed

- **WHEN** the person chooses another view, Today again, or another date or slot while the open entry's save has failed or is still running
- **THEN** the view changes only once the entry is acknowledged; a failed save keeps the entry open with its failure notice and an English notice that it stays open until it is saved, and a save that can never succeed keeps it open with the offer to reload the saved version.

#### Scenario: Refused close, quit, restore or erasure opens the unsaved input

- **WHEN** closing the window, quitting, restoring a backup or erasing app data is refused because input still cannot be saved after a flush, for example an entry left behind by a view that failed
- **THEN** the app shows that input with its failure, Today on its date and slot or Weekly Review on its week, with an English notice saying why the action did not proceed, rather than asking to wait for Saved.

#### Scenario: Insights choice during a failed save

- **WHEN** an entry's save has failed and, before its retry, the person changes that entry's Include in insights and timelines choice in a reading view, reached after Today failed while showing the entry
- **THEN** the choice is saved together with the unsaved input, or withdrawn if that save fails too, so the retry needs no reload that would discard the input.

### Requirement: Safe migrations

The system SHALL apply versioned schema migrations without silently dropping existing journal content and SHALL leave a recoverable prior state when a migration fails.

#### Scenario: Upgrade fictional database

- **WHEN** a previous supported database version is opened
- **THEN** migration preserves its entries, dates, and structured answers.

#### Scenario: Upgrade from the version before reading

- **WHEN** a journal stored exactly as schema version 2 did, with an active entry, an entry in the trash and display preferences, is opened by a version that reads it as version 2 and upgrades it after its pre-migration backup
- **THEN** that backup holds the version-2 journal, the entries load as stored, the trashed entry keeps its deletion time, every display preference is kept, and every upgraded entry is included in insights, so Trends and Weekly Review count it.

#### Scenario: Migration failure

- **WHEN** a migration cannot complete
- **THEN** the app reports the failure and does not replace the existing journal with an empty database.

### Requirement: Local authority

The system SHALL keep the authoritative journal in the dedicated application-data location and SHALL operate without Python, internet connectivity, or an LLM.

#### Scenario: Offline restart

- **WHEN** the app restarts offline with no Python or model installed
- **THEN** saved entries can be read, edited, and saved using the same local authority.
