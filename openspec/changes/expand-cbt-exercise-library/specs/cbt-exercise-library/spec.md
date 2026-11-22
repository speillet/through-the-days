# cbt-exercise-library

## Purpose

Offer additional bounded offline reflection templates after the original manual workflows, without blocking independent delivery of the core CBT companion.

Sources: appendix INT-09 (§11); README_THROUGH_THE_DAYS.md §§13, 18.8. Existing cbt-worksheets owns original sessions and experiments.

## ADDED Requirements

### Requirement: Progressive offline exercise library

The system SHALL keep the existing manual exercises and progressively add Behavioural Experiment, Coping Estimate, Positive Evidence Journal, and Values-to-Action Reflection as bounded, inspectable offline templates.

#### Scenario: Later templates not shipped

- **WHEN** the extended library is not yet delivered
- **THEN** the original three manual exercises remain usable and later templates are not presented as working.

#### Scenario: AI-free library

- **WHEN** the person selects a delivered template with AI disabled
- **THEN** its steps can be completed manually without forced positivity, prescriptive unsafe tasks, or a claim of clinical benefit.

#### Scenario: Suggested exercise choice

- **WHEN** optional assistance suggests exercises
- **THEN** it offers at most two options with a short rationale and leaves the choice to the person.
