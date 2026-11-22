# personal-patterns

## Purpose

Explore descriptive associations using the journal's shared metric definitions, source visibility, method versions, and honest observation coverage.

Sources: appendix INT-04/07/08 (§§6, 9–10, 13.4); shared product-guardrails and llm-assistance apply.

## ADDED Requirements

### Requirement: Shared definitions and denominators

Personal Patterns SHALL reuse existing score/action/keyword/goal definitions and distinguish lexical mentions, uncertain semantic topics, and any separately confirmed self-reported events, with dates, sample sizes, and source coverage.

#### Scenario: Different writing volumes

- **WHEN** the person compares keyword mentions across months with unequal word counts
- **THEN** both raw and per-1,000-word rates and recorded coverage are shown; mentions are not episodes.

#### Scenario: Missing follow-up

- **WHEN** an action plan has no explicit outcome
- **THEN** the comparison treats it as unknown rather than unsuccessful.

### Requirement: Qualified associations

Association views SHALL identify compared variables, observation count, time window, missingness, and confounding limits, avoiding causal, diagnostic, relapse-prediction, or wellbeing-forecast claims.

#### Scenario: Sparse observations

- **WHEN** a selected comparison lacks enough observations under its documented method
- **THEN** the app reports insufficient evidence rather than a broad trend.

#### Scenario: Activity and energy coexist

- **WHEN** recorded activity days are associated with particular reported energy values
- **THEN** the display says associated in these entries and does not claim the activity caused the values.

### Requirement: Inspectable versioned analysis

The system SHALL identify method/model/dictionary versions for pattern results, retain distinct run metadata when methods change, and respect metric hiding, Gentle view, and source exclusions.

#### Scenario: Dictionary changes

- **WHEN** a new dictionary or model triggers rescanning
- **THEN** the new result has a distinct versioned run and does not silently relabel an older result as if calculated by the new method.

#### Scenario: Metric hidden

- **WHEN** the person hides a sensitive metric or enables Gentle view
- **THEN** the pattern view does not resurface its optional interpretation or score panel.
