# approved-exports

## Purpose

Share only specifically selected and previewed aggregate information while keeping private journal material under the person's control.

Sources: README §§1, 10, 13 phase 6, 17.3, 20 cases 10 and 20.

## ADDED Requirements

### Requirement: Exact aggregate preview and approval

Before producing an external/Hugo aggregate export, the system SHALL show the exact selected fields and values, identify sources/coverage, and require explicit approval.

#### Scenario: Export cancelled

- **WHEN** the person cancels the preview
- **THEN** no export is produced or published.

#### Scenario: Approved selection

- **WHEN** the person approves a specific aggregate selection
- **THEN** the produced payload matches that preview without adding fields.

### Requirement: Private content exclusions

Aggregate exports SHALL exclude private prose, conversations, CBT answers, credentials, and unapproved counter data by default.

#### Scenario: Sensitive source journal

- **WHEN** selected aggregates derive from entries with private prose and hidden counters
- **THEN** the output contains only the explicitly approved aggregate fields.

### Requirement: Separate publication control

The system SHALL keep exporting selected aggregate files distinct from publishing them and SHALL preserve the ability to use the journal without exporting.

#### Scenario: Approved file export

- **WHEN** the person approves creating a local Hugo-compatible aggregate file
- **THEN** the file is created without automatically committing, pushing, or publishing it.
