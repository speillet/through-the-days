# keyword-analysis

## Purpose

Make word and topic exploration auditable with reproducible methods, source passages, and explicit corpus coverage.

Sources: README §16, 19.2, 20 case 16.

## ADDED Requirements

### Requirement: Explicit matching methods

The system SHALL distinguish exact matches, approved lexical families, and semantic topics, labelling normalization, algorithm/lexicon versions, and reviewable uncertainty.

#### Scenario: Phrase minimises rumination

- **WHEN** source text states that the person ruminated less
- **THEN** a literal match is not presented as a confirmed rumination episode.

### Requirement: Separate denominators

Keyword statistics SHALL report occurrences, entries containing matches, distinct journal dates, words in scope, normalized matches per 1,000 words, and actual source coverage separately.

#### Scenario: Empty word scope

- **WHEN** the selected source/range contains no words
- **THEN** normalized frequency is missing rather than a fabricated number.

#### Scenario: Different window types

- **WHEN** the person compares rolling 30 days with a calendar month
- **THEN** each result labels its actual date boundaries.

### Requirement: Auditable current passages

Every match SHALL identify its source, text version, and offsets under a documented convention, and obsolete matches SHALL be invalidated after editing or reimporting.

#### Scenario: Changed text

- **WHEN** the person edits a source passage and the index rebuilds
- **THEN** old-version matches are removed rather than counted alongside the new matches.

### Requirement: Multilingual source control

The system SHALL allow Journal, ChatGPT, or Both source selection, preserve original-language excerpts, and document language-aware tokenization and time-zone rules.

#### Scenario: Combined multilingual source

- **WHEN** the person selects Both over a multilingual corpus
- **THEN** the result identifies sources, preserves excerpts, and reports the documented counting method and coverage.
