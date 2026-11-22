# product-guardrails

## Purpose

Keep product behavior private, accessible, English-language, and faithful to the person's own words across every milestone.

Sources: README §§0–2, 5.3, 10.3, 18, 20 cases 8, 10, 21–23.

## ADDED Requirements

### Requirement: English first-party content

The system SHALL use English for all first-party interface copy, prompts, notifications, seeded labels, reports, validation messages, and generated explanations.

#### Scenario: Non-English operating system

- **WHEN** the Mac language is French and a flow includes an empty state or error
- **THEN** all first-party text remains English while user text retains its original language.

### Requirement: Accessible original interface

The system SHALL communicate meaning beyond colour, support keyboard and VoiceOver use, respect reduced motion, and use an original visual identity.

#### Scenario: Colour unavailable

- **WHEN** emotion and score information is read without colour
- **THEN** text or other accessible cues retain its meaning.

#### Scenario: Reduced motion

- **WHEN** the person enables reduced motion
- **THEN** nonessential animation is disabled without preventing navigation or writing.

### Requirement: Private defaults

The system SHALL keep private content local by default and SHALL require a specific user-approved flow before sending or exporting any selected private data.

#### Scenario: Ordinary writing

- **WHEN** the person creates, reads, or edits a journal entry
- **THEN** its content is not uploaded to GitHub, a model provider, Hugo, or another service.

#### Scenario: Feature disabled

- **WHEN** AI, imports, and exports have not been enabled
- **THEN** core journaling remains fully usable offline.

### Requirement: Faithful user text

The system SHALL preserve user-authored and imported content in its original language without silent translation, rewriting, or fabricated achievements.

#### Scenario: Multilingual content

- **WHEN** a person saves or imports non-English material
- **THEN** source text is preserved and generated interface explanations remain English.

### Requirement: Synthetic verification data

Development and automated verification SHALL use explicitly synthetic records and SHALL keep personal journal content and secrets outside version control and CI artifacts.

#### Scenario: CI test fixture

- **WHEN** a test requires an entry or conversation
- **THEN** its fixture is fictional and does not include personal records or credentials.

### Requirement: Gentle view

The system SHALL provide an optional global Gentle view that hides optional numeric panels, distress interpretations, counters/streak prompts, unsolicited insights, and automatic follow-up prompts while preserving stored data and core navigation.

#### Scenario: Simpler journal view

- **WHEN** the person enables Gentle view
- **THEN** writing, calendar navigation when delivered, user-authored wins, and manual worksheets remain accessible while optional tracking panels are hidden.

#### Scenario: Restore display preferences

- **WHEN** the person leaves Gentle view
- **THEN** previous per-surface display choices can be restored without changing scores, goal events, reminders' opt-in state, or journal content.

#### Scenario: Data protection continues

- **WHEN** Gentle view suppresses optional follow-up prompts
- **THEN** save failures and required backup-passphrase requests remain visible and daily backups are not disabled.

### Requirement: Independent derived-data control

The system SHALL allow clearing derived indexes, embeddings, generated summaries, and pinned-memory excerpts without deleting original user records, and SHALL invalidate their content when referenced sources are deleted or excluded.

#### Scenario: Clear derived information

- **WHEN** the person clears generated summaries, pins, and semantic indexes
- **THEN** the selected derived records disappear while original writing and explicitly authored review notes remain unchanged.

#### Scenario: Source removed during indexing

- **WHEN** a source is trashed, deleted, or excluded while a rebuild is pending
- **THEN** retrieval and generated views stop exposing its text immediately rather than waiting for the rebuild.

#### Scenario: Data erasure requested

- **WHEN** the person explicitly requests full application-managed local data deletion
- **THEN** the confirmed scope includes derivatives and application credentials, and any separately retained backup/export copies and limits are explained.

### Requirement: Sensitive diagnostics excluded

Default diagnostics and telemetry SHALL exclude private prompts, responses, entries, mood/progress data, embeddings, screenshots, and source excerpts, including CI and issue-template artifacts.

#### Scenario: Analysis error

- **WHEN** retrieval, inference, or export fails on a private source
- **THEN** only necessary non-sensitive operational metadata reaches diagnostics, not the private payload or its embedding.
