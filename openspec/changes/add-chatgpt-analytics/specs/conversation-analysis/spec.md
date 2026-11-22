# conversation-analysis

## Purpose

Produce reviewable, versioned conversation metrics with explicit provenance and descriptive source-separated interpretation.

Sources: README §§8.2–8.4, 9, 16, 19–20.

## ADDED Requirements

### Requirement: Reviewable extracted events

Each extracted rumination mention, countdown request, topic, action idea, decision, or reported action SHALL retain source-message reference, timestamp, method/classifier version, and review status.

#### Scenario: Open extracted event

- **WHEN** the person inspects an extracted event
- **THEN** the source message and extraction method/version are available.

### Requirement: Descriptive separate sources

Reports SHALL distinguish journal self-reports from conversation extractions, keep counts separate from time or clinical episodes, and label associations as descriptive rather than causal.

#### Scenario: Rumination mentions

- **WHEN** a report counts messages mentioning rumination
- **THEN** it does not describe the count as diagnosed episodes or duration.

### Requirement: Reproducible local analysis

Analysis SHALL operate on already available authorised local data, label its coverage and versions, preserve source-language excerpts, and generate English first-party reports.

#### Scenario: Offline repeat analysis

- **WHEN** the same supported local data and versions are processed again offline
- **THEN** reported results are reproducible without fetching private account history or changing journal records.
