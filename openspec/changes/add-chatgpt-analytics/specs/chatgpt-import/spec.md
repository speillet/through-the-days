# chatgpt-import

## Purpose

Ingest explicitly supplied local exports reproducibly while keeping journal functionality independent of account access or import success.

Sources: README §§9–10, 19, 20 case 11.

## ADDED Requirements

### Requirement: Manual supplied exports

The system SHALL import supported official ZIP exports or conversations.json supplied by the person and SHALL identify unsupported or invalid input without assuming consumer-account API access.

#### Scenario: No export supplied

- **WHEN** the app has no imported conversation files
- **THEN** journaling works and no account-scraping synchronization is promised.

#### Scenario: Unsupported input

- **WHEN** the person supplies an unsupported export structure
- **THEN** the import reports the issue without mutating the journal.

### Requirement: Idempotent provenance

The importer SHALL retain stable source identifiers, timestamps, source hashes, parser version, and import status, deduplicating repeated supplied data.

#### Scenario: Repeated import

- **WHEN** the same synthetic export is imported twice
- **THEN** conversation/message counts do not double and source references remain stable.

### Requirement: Bounded local parsing

The importer SHALL validate archive paths, supported encodings, dates, and documented size/resource bounds, and SHALL keep private import files outside version control.

#### Scenario: Unsafe archive member

- **WHEN** an export contains a traversal path or exceeds the documented limits
- **THEN** the importer rejects it without writing outside its authorised local destination.

### Requirement: Separate original-language store

Imported conversations SHALL retain their original text/language and source identity in a separate local analytics store without becoming journal self-reports.

#### Scenario: Non-English conversation

- **WHEN** a supported non-English conversation is imported
- **THEN** the original text survives and is labelled as ChatGPT source rather than journal content.
