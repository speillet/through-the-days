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
