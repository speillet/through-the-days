# private-data-portability

## Purpose

Let the person deliberately export and recover their own selected journal content in portable formats, separately from public aggregate sharing and encrypted backups.

Sources: appendix INT-10 (§12), TEST-22; existing approved-exports owns Hugo/public aggregate restrictions.

## ADDED Requirements

### Requirement: Explicit private export selection

Private export SHALL offer Markdown, versioned JSON, a selected-range PDF book, and quantitative CSV, with explicit dates/content selection and a destination/protection preview before writing any file.

#### Scenario: Personal PDF selected

- **WHEN** the person selects a date range and content types for a private PDF
- **THEN** only that selected material is rendered and the chosen private file is not automatically published.

#### Scenario: Quantitative CSV

- **WHEN** the person exports check-in values including missing optional progress
- **THEN** the CSV documents ranges/fields and preserves missing values rather than substituting zero.

#### Scenario: Markdown privacy choice

- **WHEN** the person excludes mood, CBT, and counter data from a Markdown export
- **THEN** the dated entries/slots retain their selected text without those excluded fields.

### Requirement: Versioned identity-preserving round trip

JSON import/export SHALL preserve selected core data, stable IDs, original timestamps, provenance, and confirmed action/CBT outcomes, with schema validation, idempotent repeated import, and explicit conflict handling.

#### Scenario: Repeat round trip

- **WHEN** the same exported synthetic JSON is imported twice
- **THEN** records and outcomes are not duplicated, IDs/timestamps are preserved, and no goal event is invented.

#### Scenario: Conflicting existing identity

- **WHEN** an imported ID differs from an active or trashed local record or targets an occupied slot
- **THEN** the app reports the conflict without silently overwriting, reviving, duplicating, or resetting either record.

#### Scenario: Invalid export file

- **WHEN** JSON is corrupted or uses an unsupported schema version
- **THEN** import reports the issue and leaves the current journal unchanged.

### Requirement: Portability does not widen sharing

Private-content export SHALL be distinct from approved public aggregates and encrypted backups; it SHALL reveal its actual protection, exclude credentials, and require explicit selection of sensitive content.

#### Scenario: Plaintext private export

- **WHEN** the person chooses an unencrypted JSON or Markdown file
- **THEN** the preview states that protection clearly without calling it an encrypted backup or sending it to GitHub/Hugo.

#### Scenario: Public export flow

- **WHEN** the person enters the Hugo export flow
- **THEN** approved-exports' aggregate allowlist applies; a private journal export cannot be substituted for the approved payload.
